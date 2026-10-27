// The day register as the phone holds it: one day, one entry per worker, and the
// payloads sync_attendance_days, sync_attendance_entries and
// sync_attendance_corrections accept. Owner: Attendance (Manish). Issue #79, ADR-048.
// Server side: ADR-021, ADR-030, ADR-033. Nothing here touches the database or the clock.

import type { OutboxStatus } from '../sync/entities';

export const ENTRY_STATUSES = ['present', 'absent', 'half_day', 'leave'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** The most characters the server keeps of a note or a correction's reason. */
export const TEXT_MAX = 500;
/** The most paid overtime hours one entry may hold (attendance_entries). */
export const OVERTIME_MAX = 8;

export type RegisterErrorCode =
  | 'status'
  | 'overtime'
  | 'overtime_needs_work'
  | 'note'
  | 'reason_required'
  | 'reason_too_long'
  | 'no_org'
  | 'bad_date'
  | 'not_on_roster'
  | 'locked'
  | 'not_locked'
  | 'no_entry'
  | 'no_change';

export class RegisterError extends Error {
  constructor(readonly code: RegisterErrorCode) {
    super(code);
    this.name = 'RegisterError';
  }
}

/** What a supervisor says about one worker on one day. */
export interface Mark {
  status: EntryStatus;
  overtimeHours: number;
  note: string | null;
}

/** Which day of which site, and the organisation every payload names. */
export interface RegisterKey {
  orgId: string;
  siteId: string;
  date: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OVERTIME = /^\d+(\.\d{1,2})?$/;
const isStatus = (v: unknown): v is EntryStatus => ENTRY_STATUSES.includes(v as EntryStatus);
// char_length counts characters, not UTF-16 units.
const chars = (s: string) => Array.from(s).length;

/**
 * Checks what was typed and says what is wrong, as the table's CHECKs would:
 * a status from the four, overtime 0 to 8 with up to two decimals and only on a
 * day worked, a note of 1 to 500 characters or none. The server stays the boundary.
 */
export function cleanMark(raw: { status: string; overtime: string; note: string }): Mark {
  if (!isStatus(raw.status)) throw new RegisterError('status');

  const text = raw.overtime.trim();
  let overtimeHours = 0;
  if (text !== '') {
    if (!OVERTIME.test(text)) throw new RegisterError('overtime');
    overtimeHours = Number(text);
    if (overtimeHours > OVERTIME_MAX) throw new RegisterError('overtime');
  }
  if (overtimeHours > 0 && raw.status !== 'present' && raw.status !== 'half_day') {
    throw new RegisterError('overtime_needs_work');
  }

  const note = raw.note.trim();
  if (chars(note) > TEXT_MAX) throw new RegisterError('note');
  return { status: raw.status, overtimeHours, note: note === '' ? null : note };
}

export function buildDayPayload(key: RegisterKey): Record<string, unknown> {
  return { org_id: key.orgId, site_id: key.siteId, attendance_date: key.date };
}

/** Every key is always there, so the shape never changes (ADR-033 D2). */
export function buildEntryPayload(key: RegisterKey, workerId: string, mark: Mark): Record<string, unknown> {
  return {
    org_id: key.orgId,
    site_id: key.siteId,
    attendance_date: key.date,
    worker_id: workerId,
    status: mark.status,
    overtime_hours: mark.overtimeHours,
    note: mark.note,
  };
}

/** The new values and a reason. The old values are stamped by the server, never sent. */
export function buildCorrectionPayload(
  key: RegisterKey,
  workerId: string,
  mark: Mark,
  reason: string,
): Record<string, unknown> {
  const why = reason.trim();
  if (why === '') throw new RegisterError('reason_required');
  if (chars(why) > TEXT_MAX) throw new RegisterError('reason_too_long');
  return {
    org_id: key.orgId,
    site_id: key.siteId,
    attendance_date: key.date,
    worker_id: workerId,
    new_status: mark.status,
    new_overtime_hours: mark.overtimeHours,
    new_note: mark.note,
    reason: why,
  };
}

export interface ParsedEntry {
  key: RegisterKey;
  workerId: string;
  mark: Mark;
}

/** Reads an entry back from an outbox payload, or null if it is not one. */
export function parseEntryPayload(payload: unknown): ParsedEntry | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.org_id !== 'string' ||
    typeof p.site_id !== 'string' ||
    typeof p.worker_id !== 'string' ||
    typeof p.attendance_date !== 'string' ||
    !DATE.test(p.attendance_date) ||
    !isStatus(p.status) ||
    typeof p.overtime_hours !== 'number' ||
    !Number.isFinite(p.overtime_hours) ||
    p.overtime_hours < 0 ||
    p.overtime_hours > OVERTIME_MAX ||
    !(p.note === null || typeof p.note === 'string')
  ) {
    return null;
  }
  return {
    key: { orgId: p.org_id, siteId: p.site_id, date: p.attendance_date },
    workerId: p.worker_id,
    mark: { status: p.status, overtimeHours: p.overtime_hours, note: p.note },
  };
}

export type StatusTone = 'wait' | 'ok' | 'attention';

// Codes from the handlers (ADR-033). Anything else is said without the code: it can
// carry server text.
const REASONS: Record<string, string> = {
  locked: 'A manager already approved this day, so this change was not applied. Propose a correction instead.',
  duplicate: 'Another phone marked this worker differently first, and the server kept that.',
  different_entry: 'The server already holds a different entry under this record.',
  different_day: 'The server already holds a different day under this record.',
  different_correction: 'The server already holds a different correction under this record.',
  permission_denied: "You can't record on this site any more.",
  invalid_input: "Something here isn't valid. Check the worker is still on this site and the day is not too far ahead.",
  invalid_state: 'The day is not approved, so there is nothing to correct yet.',
};
const UNKNOWN_REASON = 'The server did not accept it.';

/**
 * What a saved entry (or day, or correction) says about itself. Only a synced
 * record is "on the server"; nothing else is called sent or submitted (ADR-009).
 */
export function entryStatusText(status: OutboxStatus, reason: string | null): { tone: StatusTone; text: string } {
  switch (status) {
    case 'pending':
    case 'syncing':
      return { tone: 'wait', text: 'Saved on this phone, waiting to send' };
    case 'failed':
      return { tone: 'wait', text: 'Could not send yet. Will retry.' };
    case 'synced':
      return { tone: 'ok', text: 'On the server' };
    case 'conflict':
    case 'rejected':
      return {
        tone: 'attention',
        text: `Needs attention · ${(reason !== null && Object.hasOwn(REASONS, reason) ? REASONS[reason] : undefined) ?? UNKNOWN_REASON}`,
      };
  }
}

// Saves and reads a user's day register through the outbox. Owner: Attendance
// (Manish). Issue #79, ADR-048. The outbox is the only place a day, an entry or a
// correction lives on the phone: every write goes there first, under its author,
// and the screen reads it back. The roster comes from the mirror, never the server.

import type { DeviceDb } from '../db/device-db';
import type { OutboxStatus } from '../sync/entities';
import { enqueue, listRecords, newRecordId, type OutboxRecord } from '../sync/outbox';
import { readApprovedDay, readRosterOn, type RosterWorker } from '../sync/pull';
import {
  buildCorrectionPayload,
  buildDayPayload,
  buildEntryPayload,
  parseEntryPayload,
  RegisterError,
  type EntryStatus,
  type Mark,
  type RegisterKey,
} from './register';

/** The part of a mirrored site a register needs. */
export interface RegisterSite {
  id: string;
  orgId: string | null;
}

export interface StoredEntry {
  recordId: string;
  mark: Mark;
  status: OutboxStatus;
  verdictReason: string | null;
}

export interface StoredCorrection {
  recordId: string;
  mark: Mark;
  /** What the supervisor wrote to explain the correction. */
  reason: string;
  status: OutboxStatus;
  verdictReason: string | null;
}

/** What the server held for a worker on an approved day at the last pull (ADR-049). */
export interface ApprovedMark {
  status: EntryStatus;
  overtimeHours: number;
}

export interface RegisterRow {
  worker: RosterWorker;
  entry: StoredEntry | null;
  correction: StoredCorrection | null;
  /** The server's approved entry, only for a worker with no entry on this phone. */
  approved: ApprovedMark | null;
}

export interface Register {
  rows: RegisterRow[];
  day: { recordId: string; status: OutboxStatus; verdictReason: string | null } | null;
  /**
   * The phone knows the day is approved: its copy of the server's approved days holds
   * the day (ADR-049), or the server answered `locked` to an entry, or accepted a
   * correction (which it takes only on an approved day). A phone that has not pulled
   * since the approval and has not been told cannot know it (ADR-048 D2). The outbox's
   * answer is never lifted by a later pull.
   */
  locked: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// listRecords reads newest first and stops at a limit; 3000 entries is about a month of a 100-worker site.
const SCAN_LIMIT = 3000;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function checkDate(date: string): void {
  if (!DATE.test(date)) throw new RegisterError('bad_date');
}

function keyOf(site: RegisterSite, date: string): RegisterKey {
  if (site.orgId === null) throw new RegisterError('no_org');
  checkDate(date);
  return { orgId: site.orgId, siteId: site.id, date };
}

function entryOf(r: OutboxRecord, date: string) {
  const parsed = parseEntryPayload(r.payload);
  return parsed && parsed.key.date === date ? parsed : null;
}

function correctionOf(r: OutboxRecord, date: string) {
  const p = r.payload;
  if (p.attendance_date !== date || typeof p.worker_id !== 'string' || typeof p.reason !== 'string') return null;
  const parsed = parseEntryPayload({
    org_id: p.org_id,
    site_id: p.site_id,
    attendance_date: p.attendance_date,
    worker_id: p.worker_id,
    status: p.new_status,
    overtime_hours: p.new_overtime_hours,
    note: p.new_note,
  });
  return parsed ? { parsed, reason: p.reason } : null;
}

/** One day of one site as this user's phone holds it. Another user's records are never read. */
export async function readRegister(db: DeviceDb, userId: string, siteId: string, date: string): Promise<Register> {
  checkDate(date);
  const [roster, approvedDay, entryRecords, dayRecords, correctionRecords] = await Promise.all([
    readRosterOn(db, userId, siteId, date),
    readApprovedDay(db, userId, siteId, date),
    listRecords(db, userId, 'attendance_entries', { siteId, limit: SCAN_LIMIT }),
    listRecords(db, userId, 'attendance_days', { siteId }),
    listRecords(db, userId, 'attendance_corrections', { siteId }),
  ]);

  // Newest first, so the first record seen for a worker is the one that counts.
  const entries = new Map<string, StoredEntry>();
  for (const r of entryRecords) {
    const e = entryOf(r, date);
    if (e && !entries.has(e.workerId.toLowerCase())) {
      entries.set(e.workerId.toLowerCase(), {
        recordId: r.recordId,
        mark: e.mark,
        status: r.status,
        verdictReason: r.reason,
      });
    }
  }
  const corrections = new Map<string, StoredCorrection>();
  for (const r of correctionRecords) {
    const c = correctionOf(r, date);
    if (c && !corrections.has(c.parsed.workerId.toLowerCase())) {
      corrections.set(c.parsed.workerId.toLowerCase(), {
        recordId: r.recordId,
        mark: c.parsed.mark,
        reason: c.reason,
        status: r.status,
        verdictReason: r.reason,
      });
    }
  }
  const dayRecord = dayRecords.find((r) => r.payload.attendance_date === date);

  const approved = new Map(approvedDay.map((a) => [a.workerId.toLowerCase(), a]));
  const locked =
    approvedDay.length > 0 ||
    [...entries.values()].some((e) => e.status === 'conflict' && e.verdictReason === 'locked') ||
    [...corrections.values()].some((c) => c.status === 'synced');

  return {
    rows: roster.map((worker) => {
      const id = worker.workerId.toLowerCase();
      const entry = entries.get(id) ?? null;
      const server = approved.get(id);
      return {
        worker,
        entry,
        correction: corrections.get(id) ?? null,
        approved: !entry && server ? { status: server.status, overtimeHours: server.overtimeHours } : null,
      };
    }),
    day: dayRecord ? { recordId: dayRecord.recordId, status: dayRecord.status, verdictReason: dayRecord.reason } : null,
    locked,
  };
}

/** Opens the day on the server's side of the outbox, once: a day record already queued is left alone. */
async function ensureDay(db: DeviceDb, userId: string, key: RegisterKey, now: Date): Promise<void> {
  const days = await listRecords(db, userId, 'attendance_days', { siteId: key.siteId });
  if (days.some((r) => r.payload.attendance_date === key.date)) return;
  await enqueue(
    db,
    { entity: 'attendance_days', recordId: newRecordId(), authorId: userId, payload: buildDayPayload(key) },
    now,
  );
}

/**
 * Marks every rostered worker who has no entry on this phone yet as present, with no
 * overtime and no note, and opens the day. It never touches a worker who already has an
 * entry, so an exception is never overwritten, and it can be tapped again to finish
 * after an interruption. Returns how many entries it made. The day is queued before
 * its entries, so the server hears of it first. (Each save is its own transaction:
 * the outbox does not nest them, so this is not one transaction, ADR-048 D1.)
 */
export async function markAllPresent(
  db: DeviceDb,
  userId: string,
  site: RegisterSite,
  date: string,
  now: Date = new Date(),
): Promise<number> {
  const key = keyOf(site, date);
  const register = await readRegister(db, userId, site.id, date);
  if (register.locked) throw new RegisterError('locked');

  const missing = register.rows.filter((r) => r.entry === null);
  if (missing.length === 0) return 0;

  await ensureDay(db, userId, key, now);
  const present: Mark = { status: 'present', overtimeHours: 0, note: null };
  for (const { worker } of missing) {
    await enqueue(
      db,
      {
        entity: 'attendance_entries',
        recordId: newRecordId(),
        authorId: userId,
        payload: buildEntryPayload(key, worker.workerId, present),
      },
      now,
    );
  }
  return missing.length;
}

/** Saves one worker's mark. An existing entry keeps its record id, so the edit re-queues it. */
export async function saveMark(
  db: DeviceDb,
  userId: string,
  site: RegisterSite,
  date: string,
  workerId: string,
  mark: Mark,
  now: Date = new Date(),
): Promise<void> {
  const key = keyOf(site, date);
  const register = await readRegister(db, userId, site.id, date);
  if (register.locked) throw new RegisterError('locked');
  const row = register.rows.find((r) => same(r.worker.workerId, workerId));
  if (!row) throw new RegisterError('not_on_roster');

  await ensureDay(db, userId, key, now);
  await enqueue(
    db,
    {
      entity: 'attendance_entries',
      recordId: row.entry?.recordId ?? newRecordId(),
      authorId: userId,
      payload: buildEntryPayload(key, row.worker.workerId, mark),
    },
    now,
  );
}

/**
 * Proposes a correction to an entry on an approved day (ADR-030). Only once the phone
 * knows the day is approved, and only for a worker who has an entry, on this phone or
 * in the server's approved day (ADR-049). A change that
 * changes nothing is refused here when the entry is known to be on the server; when it
 * is not, the server judges. A correction that is not yet on the server, or was
 * refused, is saved again under its own id; one the server already holds gets a new id.
 */
export async function proposeCorrection(
  db: DeviceDb,
  userId: string,
  site: RegisterSite,
  date: string,
  workerId: string,
  mark: Mark,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  const key = keyOf(site, date);
  const register = await readRegister(db, userId, site.id, date);
  if (!register.locked) throw new RegisterError('not_locked');
  const row = register.rows.find((r) => same(r.worker.workerId, workerId));
  if (!row) throw new RegisterError('not_on_roster');
  const entry = row.entry;
  if (!entry && !row.approved) throw new RegisterError('no_entry');
  // The mirror holds no note, so a correction on a worker known only from it is judged by the server.
  if (
    entry &&
    entry.status === 'synced' &&
    entry.mark.status === mark.status &&
    entry.mark.overtimeHours === mark.overtimeHours &&
    entry.mark.note === mark.note
  ) {
    throw new RegisterError('no_change');
  }

  const payload = buildCorrectionPayload(key, row.worker.workerId, mark, reason);
  const open = row.correction && row.correction.status !== 'synced' ? row.correction.recordId : newRecordId();
  await enqueue(db, { entity: 'attendance_corrections', recordId: open, authorId: userId, payload }, now);
}

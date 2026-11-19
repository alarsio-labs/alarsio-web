// One worker's month as this phone holds it. Owner: Attendance (Manish). Issue #234, ADR-053.
// Marks come from the month mirror, with anything saved on this phone laid over them: the
// outbox is where a mark lives until the server has it, so it always wins (ADR-048).

import type { DeviceDb } from '../db/device-db';
import type { OutboxStatus } from '../sync/entities';
import { listRecords } from '../sync/outbox';
import { istDate, mirrorInfo, readApprovedDates, readMonthEntries, readWorkerAssignments } from '../sync/pull';
import {
  monthDates,
  shiftMonth,
  summariseMonth,
  whyNotMarkable,
  type DayMark,
  type MonthSummary,
  type NotMarkable,
} from './month';
import { parseEntryPayload } from './register';
import { SCAN_LIMIT } from './register-store';

export interface MonthDay {
  date: string;
  mark: DayMark | null;
  /** The note of a mark saved on this phone. The month mirror holds no notes, so null for a server mark. */
  note: string | null;
  /** Where a mark saved on this phone has got to; null for a mark that came from the server. */
  sync: { status: OutboxStatus; verdictReason: string | null } | null;
  /** The phone knows the day is approved: a change goes through a correction in the day register. */
  locked: boolean;
  /** Why the date cannot be marked at all, or null. */
  blocked: NotMarkable | null;
}

export interface WorkerMonth {
  /** False for a month older than the phone holds: read it on the web. */
  available: boolean;
  days: MonthDay[];
  summary: MonthSummary;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function readWorkerMonth(
  db: DeviceDb,
  userId: string,
  siteId: string,
  workerId: string,
  month: string,
  now: Date = new Date(),
): Promise<WorkerMonth> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM');
  const today = istDate(now.toISOString());
  if (month < shiftMonth(today.slice(0, 7), -1)) {
    return { available: false, days: [], summary: summariseMonth([], new Map()) };
  }

  const [mirror, approvedDates, assignments, records, info] = await Promise.all([
    readMonthEntries(db, userId, siteId, workerId, month),
    readApprovedDates(db, userId, siteId, month),
    readWorkerAssignments(db, userId, siteId, workerId),
    listRecords(db, userId, 'attendance_entries', { siteId, limit: SCAN_LIMIT }),
    mirrorInfo(db),
  ]);
  const refreshedAt = info ? Date.parse(info.refreshedAt) : 0;

  const marks = new Map<string, DayMark>(mirror.map((e) => [e.workDate, { status: e.status, overtimeHours: e.overtimeHours }]));
  const sync = new Map<string, MonthDay['sync']>();
  const notes = new Map<string, string | null>();
  const seen = new Set<string>();
  const locked = new Set(approvedDates);
  // Newest first, so the first record seen for a date is the one that counts.
  for (const r of records) {
    const e = parseEntryPayload(r.payload);
    if (!e || !same(e.workerId, workerId) || !e.key.date.startsWith(`${month}-`) || seen.has(e.key.date)) continue;
    seen.add(e.key.date);
    // The server has it and a pull since then holds the day: the pull is newer, it may carry a change made elsewhere.
    if (r.status === 'synced' && Date.parse(r.updatedAt) < refreshedAt && marks.has(e.key.date)) continue;
    marks.set(e.key.date, { status: e.mark.status, overtimeHours: e.mark.overtimeHours });
    sync.set(e.key.date, { status: r.status, verdictReason: r.reason });
    notes.set(e.key.date, e.mark.note);
    if (r.status === 'conflict' && r.reason === 'locked') locked.add(e.key.date);
  }

  const dates = monthDates(month);
  const days = dates.map((date): MonthDay => {
    const reasons = assignments.map((a) => whyNotMarkable(date, today, a));
    return {
      date,
      mark: marks.get(date) ?? null,
      note: notes.get(date) ?? null,
      sync: sync.get(date) ?? null,
      locked: locked.has(date),
      blocked: reasons.length === 0 || reasons.every((r) => r !== null) ? (reasons[0] ?? 'not_assigned') : null,
    };
  });
  return { available: true, days, summary: summariseMonth(dates, marks) };
}

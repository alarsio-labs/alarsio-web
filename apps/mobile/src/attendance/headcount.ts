// How many workers this user's attendance puts on a site on one day. Owner:
// Attendance (Manish). Added for Daily Reporting's headcount pre-fill (#109,
// ADR-038), so only Attendance's code reads an entry's payload: the report screen
// asks this function and never parses the record itself. Read-only, from the
// outbox, under the signed-in user (ADR-020). Nothing is sent from here.

import type { DeviceDb } from '../db/device-db';
import { listRecords } from '../sync/outbox';

export interface Headcount {
  /** Distinct workers present or on a half day. */
  onSite: number;
  /** Of those, how many were on a half day. */
  halfDay: number;
}

const STATUSES = ['present', 'absent', 'half_day', 'leave'] as const;
type EntryStatus = (typeof STATUSES)[number];

// listRecords reads newest first and stops at a limit. 3000 entries is about a
// month of a 100-worker site, so today's and recent days are always found (D6).
const SCAN_LIMIT = 3000;

function entryOf(p: unknown): { siteId: string; date: string; workerId: string; status: EntryStatus } | null {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const v = p as Record<string, unknown>;
  if (
    typeof v.site_id !== 'string' ||
    typeof v.attendance_date !== 'string' ||
    typeof v.worker_id !== 'string' ||
    !STATUSES.includes(v.status as EntryStatus)
  ) {
    return null;
  }
  return {
    siteId: v.site_id.toLowerCase(),
    date: v.attendance_date,
    workerId: v.worker_id.toLowerCase(),
    status: v.status as EntryStatus,
  };
}

/**
 * The day's headcount from the entries this user saved on this phone, or null
 * when the phone holds none for that site and day. An entry the server rejected
 * was never stored, so it is not counted. A worker counts once, by their newest
 * entry.
 */
export async function readHeadcount(
  db: DeviceDb,
  userId: string,
  siteId: string,
  date: string,
): Promise<Headcount | null> {
  if (!userId) return null;
  const site = siteId.toLowerCase();
  const records = await listRecords(db, userId, 'attendance_entries', { siteId: site, limit: SCAN_LIMIT });

  const newest = new Map<string, EntryStatus>();
  for (const r of records) {
    if (r.status === 'rejected') continue;
    const e = entryOf(r.payload);
    if (!e || e.siteId !== site || e.date !== date || newest.has(e.workerId)) continue;
    newest.set(e.workerId, e.status);
  }
  if (newest.size === 0) return null;

  let onSite = 0;
  let halfDay = 0;
  for (const status of newest.values()) {
    if (status === 'present') onSite += 1;
    if (status === 'half_day') {
      onSite += 1;
      halfDay += 1;
    }
  }
  return { onSite, halfDay };
}

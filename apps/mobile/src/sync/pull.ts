// Pull: copies what the signed-in user may see onto the phone, so capture
// screens work with no signal. Owner: Offline Sync (Nikhil). Issue #49, ADR-023.
//
// Full refresh, not incremental: when a supervisor is taken off a site, RLS
// simply stops returning it, and only a full refresh notices that. The data
// is small (a few sites, dozens of materials, hundreds of workers).
//
// A pull replaces every mirror in one transaction, and only when every page of
// every source arrived and parsed; otherwise the old mirror stays whole. The
// server is reached through a MirrorSource, so every path is tested offline.

import { isCashCategory, type CashCategory } from '../cash/cash';
import type { DeviceDb } from '../db/device-db';
import { SESSION_CHANGED, SyncTransportError } from './sender';

/** The page the phone asks for. A server may return fewer: its own cap can be lower. */
export const PULL_PAGE_SIZE = 1000;
/** A safety stop, far above any real size, so a misbehaving server cannot loop a pull forever. */
const MAX_PAGES = 1000;

export type MirrorKind = 'sites' | 'materials' | 'roster' | 'approved_days' | 'report_status' | 'month_entries' | 'advances' | 'cash_entries';

/** The column each source is ordered and paged by. */
const KEY_FIELD: Record<MirrorKind, string> = {
  sites: 'id',
  materials: 'material_id',
  roster: 'assignment_id',
  approved_days: 'entry_id',
  report_status: 'id',
  month_entries: 'entry_id',
  advances: 'id',
  cash_entries: 'id',
};

export interface MirrorSource {
  /** The signed-in user's id, or null when no one is signed in. */
  currentUserId(): Promise<string | null>;
  /**
   * Up to `limit` rows of one source, in key order, whose key is greater than
   * `after` (null for the first page), read under `userId`'s session only.
   * Paging by key, not by offset, so a row added or removed between pages cannot
   * make the next page skip a row or repeat one. Throws
   * SyncTransportError('session_changed') if someone else is signed in by now, or
   * another SyncTransportError on failure.
   */
  fetchPage(kind: MirrorKind, userId: string, after: string | null, limit: number): Promise<unknown[]>;
}

export type PullResult =
  | { kind: 'signed_out' }
  // `monthStale`: the month view failed, so the month rows are the ones from an earlier pull (ADR-053).
  | { kind: 'done'; sites: number; materials: number; roster: number; approvedDays: number; monthStale?: true }
  | { kind: 'failed'; reason: string };

export interface MirrorSite {
  id: string;
  /**
   * The site's organisation, which every Attendance payload names (#79). Null only
   * on a phone whose mirror was pulled before device migration 5; the next pull
   * fills it.
   */
  orgId: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  status: string;
}

export interface MirrorMaterial {
  id: string;
  siteId: string;
  name: string;
  unit: string;
  /** Low-stock threshold in thousandths of the unit, or null for no alert. */
  thresholdMilli: number | null;
  /** Server balance at the last pull, in thousandths of the unit. */
  balanceMilli: number;
}

/** A worker rostered at a site on some date, once however many assignment rows they hold. */
export interface RosterWorker {
  workerId: string;
  siteId: string;
  code: string;
  name: string;
  trade: string;
}

/** The statuses an attendance entry can hold (attendance_entries). */
export type ApprovedStatus = 'present' | 'absent' | 'half_day' | 'leave';
const isApprovedStatus = (v: unknown): v is ApprovedStatus =>
  v === 'present' || v === 'absent' || v === 'half_day' || v === 'leave';

/** One worker's entry on an approved day, as the server held it at the last pull (ADR-049). */
export interface ApprovedEntry {
  workerId: string;
  status: ApprovedStatus;
  /** Paid overtime hours, 0 to 8, at most two decimals. */
  overtimeHours: number;
  approvedAt: string;
}

/** The statuses daily_report_status shows; a draft never leaves the phone that wrote it. */
export type ReportServerStatus = 'submitted' | 'reviewed' | 'rejected';
const isReportServerStatus = (v: unknown): v is ReportServerStatus => v === 'submitted' || v === 'reviewed' || v === 'rejected';

/**
 * The server's view of one of the author's reports at the last pull (#136, ADR-051).
 * `rejected` is what a manager's "Send back" stores; its note is then never blank.
 */
export interface ReportStatus {
  id: string;
  siteId: string;
  /** Asia/Kolkata calendar day. */
  reportDate: string;
  status: ReportServerStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  /** The report's content (#267, ADR-057). Null means "not known", never an empty report. */
  headcount: number | null;
  workDone: string | null;
  blockers: string | null;
  nextDayPlan: string | null;
  seriousBlocker: boolean;
  safetyIncident: boolean;
}

/** The status of an attendance day (attendance_days). */
export type DayStatus = 'open' | 'approved' | 'rejected';
const isDayStatus = (v: unknown): v is DayStatus => v === 'open' || v === 'approved' || v === 'rejected';

/** One entry of the month mirror (#234, ADR-053): a worker's mark, and the status of its day. */
export interface MonthEntry {
  /** Asia/Kolkata calendar day. */
  workDate: string;
  status: ApprovedStatus;
  /** Paid overtime hours, 0 to 8, at most two decimals. */
  overtimeHours: number;
  dayStatus: DayStatus;
}

interface MonthRow extends MonthEntry {
  entryId: string;
  siteId: string;
  workerId: string;
  overtimeHundredths: number;
}

/** An advance, or its cancellation (reversesId set), as the server holds it. */
export interface MirroredAdvance {
  id: string;
  siteId: string;
  workerId: string;
  /** Asia/Kolkata calendar day. */
  paidOn: string;
  amountPaise: number;
  note: string | null;
  reversesId: string | null;
}

/** A cash book entry, or its cancellation (reversesId set), as the server holds it. */
export interface MirroredCashEntry {
  id: string;
  siteId: string;
  /** Asia/Kolkata calendar day. */
  entryDate: string;
  category: CashCategory;
  amountPaise: number;
  note: string | null;
  reversesId: string | null;
}

/** What the phone holds for its owner, and when it was refreshed. */
export interface MirrorSummary {
  refreshedAt: string;
  sites: number;
  materials: number;
  roster: number;
  approvedDays: number;
}

interface ApprovedRow extends ApprovedEntry {
  entryId: string;
  siteId: string;
  /** Asia/Kolkata calendar day. */
  workDate: string;
  overtimeHundredths: number;
}

interface AssignmentRow extends RosterWorker {
  assignmentId: string;
  /** Asia/Kolkata calendar day, as ADR-021 D10 counts days. */
  assignedOn: string;
  /** The same, or null while the assignment is open. */
  unassignedOn: string | null;
}

/** A row the phone cannot read, or a server that does not page. Fixed reasons, never raw text. */
class PullError extends Error {}

export interface RunPullOptions {
  now?: () => Date;
  pageSize?: number;
}

/** Refreshes every mirror for the signed-in user, or leaves them as they were. */
export async function runPull(
  db: DeviceDb,
  source: MirrorSource,
  { now = () => new Date(), pageSize = PULL_PAGE_SIZE }: RunPullOptions = {},
): Promise<PullResult> {
  let userId: string | null;
  let sites: MirrorSite[];
  let materials: MirrorMaterial[];
  let roster: AssignmentRow[];
  let approved: ApprovedRow[];
  let reports: ReportStatus[];
  let months: MonthRow[] | null;
  let advances: MirroredAdvance[] | null;
  let cash: MirroredCashEntry[] | null;
  try {
    userId = await source.currentUserId();
    if (userId === null) return { kind: 'signed_out' };
    sites = (await fetchAll(source, 'sites', userId, pageSize, toSite)).filter((s) => s.status !== 'archived');
    materials = await fetchAll(source, 'materials', userId, pageSize, toMaterial);
    roster = await fetchAll(source, 'roster', userId, pageSize, toAssignment);
    approved = await fetchAll(source, 'approved_days', userId, pageSize, toApprovedDay);
    reports = await fetchAll(source, 'report_status', userId, pageSize, toReportStatus);
    months = await fetchOptional(source, 'month_entries', userId, pageSize, toMonthEntry);
    advances = await fetchOptional(source, 'advances', userId, pageSize, toMirroredAdvance);
    cash = await fetchOptional(source, 'cash_entries', userId, pageSize, toMirroredCashEntry);

    // Still the same user? A sign-out that landed while the pages were coming in
    // must not be undone by a write of that user's data afterwards. This narrows
    // the window; clearMirrors on sign-out covers what is left.
    const stillSignedIn = await source.currentUserId();
    if (stillSignedIn === null || stillSignedIn.toLowerCase() !== userId.toLowerCase()) {
      return { kind: 'failed', reason: SESSION_CHANGED };
    }
  } catch (error) {
    return { kind: 'failed', reason: reasonOf(error) };
  }

  // Only what belongs to a site the phone holds: an archived site's materials and
  // roster would be orphans.
  const siteIds = new Set(sites.map((s) => s.id));
  materials = materials.filter((m) => siteIds.has(m.siteId));
  roster = roster.filter((w) => siteIds.has(w.siteId));
  approved = approved.filter((a) => siteIds.has(a.siteId));
  reports = reports.filter((r) => siteIds.has(r.siteId));
  months = months?.filter((m) => siteIds.has(m.siteId)) ?? null;
  advances = advances?.filter((a) => siteIds.has(a.siteId)) ?? null;
  cash = cash?.filter((c) => siteIds.has(c.siteId)) ?? null;

  const owner = userId.toLowerCase();
  try {
    // Old month, advance and cash rows are kept only when they are this user's own.
    const before = await mirrorInfo(db);
    const keepMonth = months === null && before?.userId === owner;
    const keepAdvances = advances === null && before?.userId === owner;
    const keepCash = cash === null && before?.userId === owner;
    const refreshedAt = now().toISOString();
    await db.transaction(async () => {
      await deleteMirrors(db, keepMonth, keepAdvances, keepCash);
      for (const s of sites) {
        await db.run(
          `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.orgId, s.name, s.address, s.latitude, s.longitude, s.geofenceRadiusM, s.status],
        );
      }
      for (const m of materials) {
        await db.run(
          `insert into mirror_materials (id, site_id, name, unit, threshold_milli, balance_milli)
           values (?, ?, ?, ?, ?, ?)`,
          [m.id, m.siteId, m.name, m.unit, m.thresholdMilli, m.balanceMilli],
        );
      }
      for (const w of roster) {
        await db.run(
          `insert into mirror_roster (assignment_id, worker_id, site_id, code, name, trade, assigned_on, unassigned_on)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
          [w.assignmentId, w.workerId, w.siteId, w.code, w.name, w.trade, w.assignedOn, w.unassignedOn],
        );
      }
      for (const a of approved) {
        await db.run(
          `insert into mirror_approved_days (entry_id, site_id, worker_id, work_date, status, overtime_hundredths, approved_at)
           values (?, ?, ?, ?, ?, ?, ?)`,
          [a.entryId, a.siteId, a.workerId, a.workDate, a.status, a.overtimeHundredths, a.approvedAt],
        );
      }
      for (const r of reports) {
        await db.run(
          `insert into mirror_report_status (id, site_id, report_date, status, review_note, reviewed_at,
             headcount, work_done, blockers, serious_blocker, safety_incident, next_day_plan)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.siteId,
            r.reportDate,
            r.status,
            r.reviewNote,
            r.reviewedAt,
            r.headcount,
            r.workDone,
            r.blockers,
            r.seriousBlocker ? 1 : 0,
            r.safetyIncident ? 1 : 0,
            r.nextDayPlan,
          ],
        );
      }
      // Up to thousands of rows: one statement per 100 rows, not one per row. 700 values stay under SQLite's 999 limit.
      if (keepMonth) await db.run(`delete from mirror_month_entries where site_id not in (select id from mirror_sites)`);
      const fresh = months ?? [];
      for (let i = 0; i < fresh.length; i += 100) {
        const chunk = fresh.slice(i, i + 100);
        await db.run(
          `insert into mirror_month_entries (entry_id, site_id, worker_id, work_date, status, overtime_hundredths, day_status)
           values ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
          chunk.flatMap((m) => [m.entryId, m.siteId, m.workerId, m.workDate, m.status, m.overtimeHundredths, m.dayStatus]),
        );
      }
      if (keepAdvances) await db.run(`delete from mirror_advances where site_id not in (select id from mirror_sites)`);
      const freshAdvances = advances ?? [];
      for (let i = 0; i < freshAdvances.length; i += 100) {
        const chunk = freshAdvances.slice(i, i + 100);
        await db.run(
          `insert into mirror_advances (id, site_id, worker_id, paid_on, amount_paise, note, reverses_id)
           values ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
          chunk.flatMap((a) => [a.id, a.siteId, a.workerId, a.paidOn, a.amountPaise, a.note, a.reversesId]),
        );
      }
      if (keepCash) await db.run(`delete from mirror_cash_entries where site_id not in (select id from mirror_sites)`);
      const freshCash = cash ?? [];
      for (let i = 0; i < freshCash.length; i += 100) {
        const chunk = freshCash.slice(i, i + 100);
        await db.run(
          `insert into mirror_cash_entries (id, site_id, entry_date, category, amount_paise, note, reverses_id)
           values ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
          chunk.flatMap((c) => [c.id, c.siteId, c.entryDate, c.category, c.amountPaise, c.note, c.reversesId]),
        );
      }
      await db.run(`insert into mirror_state (id, user_id, refreshed_at, month_refreshed_at) values (1, ?, ?, ?)`, [
        owner,
        refreshedAt,
        months ? refreshedAt : keepMonth ? (before?.monthRefreshedAt ?? null) : null,
      ]);
    });
  } catch {
    // The transaction rolled back, so the old mirror is intact. The message can
    // name files, so it is not kept.
    return { kind: 'failed', reason: 'local_error' };
  }
  return {
    kind: 'done',
    sites: sites.length,
    materials: materials.length,
    roster: roster.length,
    approvedDays: approved.length,
    ...(months === null && { monthStale: true as const }),
  };
}

/**
 * Whose mirror this is, when it was refreshed, and when its month rows were (null if it
 * holds none); null before the first pull.
 */
export async function mirrorInfo(
  db: DeviceDb,
): Promise<{ userId: string; refreshedAt: string; monthRefreshedAt: string | null } | null> {
  const [row] = await db.all<{ user_id: string; refreshed_at: string; month_refreshed_at: string | null }>(
    `select user_id, refreshed_at, month_refreshed_at from mirror_state where id = 1`,
  );
  return row ? { userId: row.user_id, refreshedAt: row.refreshed_at, monthRefreshedAt: row.month_refreshed_at } : null;
}

/** What the phone holds for this user, or null when it holds nothing of theirs. */
export async function mirrorSummary(db: DeviceDb, userId: string): Promise<MirrorSummary | null> {
  const info = await mirrorInfo(db);
  if (info === null || info.userId !== userId.toLowerCase()) return null;
  const [row] = await db.all<{ sites: number; materials: number; roster: number; approved: number }>(
    `select (select count(*) from mirror_sites) as sites,
            (select count(*) from mirror_materials) as materials,
            (select count(distinct worker_id) from mirror_roster) as roster,
            (select count(*) from mirror_approved_days) as approved`,
  );
  return {
    refreshedAt: info.refreshedAt,
    sites: row?.sites ?? 0,
    materials: row?.materials ?? 0,
    roster: row?.roster ?? 0,
    approvedDays: row?.approved ?? 0,
  };
}

/** Empties every mirror. For sign-out on a shared phone (#56). */
export async function clearMirrors(db: DeviceDb): Promise<void> {
  await db.transaction(() => deleteMirrors(db));
}

export async function readSites(db: DeviceDb, userId: string): Promise<MirrorSite[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    id: string;
    org_id: string | null;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    geofence_radius_m: number;
    status: string;
  }>(
    `select id, org_id, name, address, latitude, longitude, geofence_radius_m, status
       from mirror_sites order by name, id`,
  );
  return rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    address: r.address,
    latitude: r.latitude,
    longitude: r.longitude,
    geofenceRadiusM: r.geofence_radius_m,
    status: r.status,
  }));
}

/** This user's mirrored materials, for one site or all of them. */
export async function readMaterials(db: DeviceDb, userId: string, siteId?: string): Promise<MirrorMaterial[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    id: string;
    site_id: string;
    name: string;
    unit: string;
    threshold_milli: number | null;
    balance_milli: number;
  }>(
    `select id, site_id, name, unit, threshold_milli, balance_milli from mirror_materials
      where (? is null or site_id = ?) order by name, id`,
    [siteId ?? null, siteId ?? null],
  );
  return rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    unit: r.unit,
    thresholdMilli: r.threshold_milli,
    balanceMilli: r.balance_milli,
  }));
}

/**
 * Who is rostered at a site on a date (YYYY-MM-DD, an Asia/Kolkata day), by the
 * rule the server uses for mark-all-present (ADR-021 D10): the assigned day is on
 * or before the date, and the assignment is open or its unassigned day is on or
 * after it, both ends inclusive. One row per worker, however many assignment rows
 * they hold. The mirror reaches back only a few days, so an older date lists only
 * who is still assigned.
 */
export async function readRosterOn(db: DeviceDb, userId: string, siteId: string, date: string): Promise<RosterWorker[]> {
  if (!isCalendarDay(date)) throw new Error('date must be YYYY-MM-DD');
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{ worker_id: string; site_id: string; code: string; name: string; trade: string }>(
    `select worker_id, site_id, min(code) as code, min(name) as name, min(trade) as trade
       from mirror_roster
      where site_id = ? and assigned_on <= ? and (unassigned_on is null or unassigned_on >= ?)
      group by worker_id, site_id
      order by min(name), worker_id`,
    [siteId, date, date],
  );
  return rows.map((r) => ({ workerId: r.worker_id, siteId: r.site_id, code: r.code, name: r.name, trade: r.trade }));
}

/**
 * Who has an entry on an approved day at a site, from the phone's copy of the server's
 * approved days (ADR-049): one row per worker. An empty answer means "not known to be
 * approved", never "open": the day may be approved after the last pull, or be older than
 * the week the mirror reaches. The date is an Asia/Kolkata day.
 */
export async function readApprovedDay(db: DeviceDb, userId: string, siteId: string, date: string): Promise<ApprovedEntry[]> {
  if (!isCalendarDay(date)) throw new Error('date must be YYYY-MM-DD');
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    worker_id: string;
    status: ApprovedStatus;
    overtime_hundredths: number;
    approved_at: string;
  }>(
    `select worker_id, status, overtime_hundredths, approved_at from mirror_approved_days
      where site_id = ? and work_date = ? order by worker_id`,
    [siteId, date],
  );
  return rows.map((r) => ({
    workerId: r.worker_id,
    status: r.status,
    overtimeHours: r.overtime_hundredths / 100,
    approvedAt: r.approved_at,
  }));
}

interface ReportStatusRow {
  id: string;
  site_id: string;
  report_date: string;
  status: ReportServerStatus;
  review_note: string | null;
  reviewed_at: string | null;
  headcount: number | null;
  work_done: string | null;
  blockers: string | null;
  serious_blocker: number | null;
  safety_incident: number | null;
  next_day_plan: string | null;
}

const REPORT_STATUS_COLUMNS = `id, site_id, report_date, status, review_note, reviewed_at, headcount, work_done,
  blockers, serious_blocker, safety_incident, next_day_plan`;

const reportStatusOf = (row: ReportStatusRow): ReportStatus => ({
  id: row.id,
  siteId: row.site_id,
  reportDate: row.report_date,
  status: row.status,
  reviewNote: row.review_note,
  reviewedAt: row.reviewed_at,
  headcount: row.headcount,
  workDone: row.work_done,
  blockers: row.blockers,
  nextDayPlan: row.next_day_plan,
  seriousBlocker: row.serious_blocker === 1,
  safetyIncident: row.safety_incident === 1,
});

/**
 * The server's status of this user's report for a site and day, from the last pull (ADR-051),
 * or null: not pulled yet, not this user's mirror, a draft, or older than two weeks. Null means
 * "not known", never "not sent back".
 */
export async function readReportStatus(db: DeviceDb, userId: string, siteId: string, date: string): Promise<ReportStatus | null> {
  if (!isCalendarDay(date)) throw new Error('date must be YYYY-MM-DD');
  if (!(await ownedBy(db, userId))) return null;
  const [row] = await db.all<ReportStatusRow>(
    `select ${REPORT_STATUS_COLUMNS} from mirror_report_status where site_id = ? and report_date = ? order by id limit 1`,
    [siteId.toLowerCase(), date],
  );
  return row ? reportStatusOf(row) : null;
}

/** Every report status the phone holds for this user (ADR-051), or none when the mirror is not theirs. */
export async function readReportStatuses(db: DeviceDb, userId: string): Promise<ReportStatus[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<ReportStatusRow>(`select ${REPORT_STATUS_COLUMNS} from mirror_report_status order by id`);
  return rows.map(reportStatusOf);
}

/**
 * One worker's entries in one month (YYYY-MM) at a site, from the month mirror (#234, ADR-053),
 * oldest day first. Only the current and the previous month are held: an empty answer for an
 * older month means "not on this phone", never "no entries".
 */
export async function readMonthEntries(
  db: DeviceDb,
  userId: string,
  siteId: string,
  workerId: string,
  month: string,
): Promise<MonthEntry[]> {
  assertMonth(month);
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    work_date: string;
    status: ApprovedStatus;
    overtime_hundredths: number;
    day_status: DayStatus;
  }>(
    `select work_date, status, overtime_hundredths, day_status from mirror_month_entries
      where site_id = ? and worker_id = ? and work_date like ? order by work_date`,
    [siteId, workerId, `${month}-%`],
  );
  return rows.map((r) => ({
    workDate: r.work_date,
    status: r.status,
    overtimeHours: r.overtime_hundredths / 100,
    dayStatus: r.day_status,
  }));
}

/**
 * The status of a site's day as the month mirror holds it, from any worker's entry that day, or
 * null when the mirror holds none. Null means "not known", never "open": the day may be older than
 * the mirror reaches, or approved since the last pull.
 */
export async function readDayStatus(db: DeviceDb, userId: string, siteId: string, date: string): Promise<DayStatus | null> {
  if (!isCalendarDay(date)) throw new Error('date must be YYYY-MM-DD');
  if (!(await ownedBy(db, userId))) return null;
  const rows = await db.all<{ day_status: DayStatus }>(
    `select day_status from mirror_month_entries where site_id = ? and work_date = ? limit 1`,
    [siteId, date],
  );
  return rows[0]?.day_status ?? null;
}

/** The days of one month (YYYY-MM) at a site that the phone knows are approved, from the month and approved-days mirrors. */
export async function readApprovedDates(db: DeviceDb, userId: string, siteId: string, month: string): Promise<string[]> {
  assertMonth(month);
  if (!(await ownedBy(db, userId))) return [];
  const like = `${month}-%`;
  const rows = await db.all<{ work_date: string }>(
    `select work_date from mirror_month_entries where site_id = ? and work_date like ? and day_status = 'approved'
     union
     select work_date from mirror_approved_days where site_id = ? and work_date like ?`,
    [siteId, like, siteId, like],
  );
  return rows.map((r) => r.work_date);
}

/** The advances the mirror holds for a site, newest day first. Empty for anyone but the mirror's owner. */
export async function readSiteAdvances(db: DeviceDb, userId: string, siteId: string): Promise<MirroredAdvance[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    id: string;
    site_id: string;
    worker_id: string;
    paid_on: string;
    amount_paise: number;
    note: string | null;
    reverses_id: string | null;
  }>(
    `select id, site_id, worker_id, paid_on, amount_paise, note, reverses_id from mirror_advances
      where site_id = ? order by paid_on desc, id`,
    [siteId],
  );
  return rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    workerId: r.worker_id,
    paidOn: r.paid_on,
    amountPaise: r.amount_paise,
    note: r.note,
    reversesId: r.reverses_id,
  }));
}

/** The cash entries the mirror holds for a site, newest day first. Empty for anyone but the mirror's owner. */
export async function readSiteCashEntries(db: DeviceDb, userId: string, siteId: string): Promise<MirroredCashEntry[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    id: string;
    site_id: string;
    entry_date: string;
    category: CashCategory;
    amount_paise: number;
    note: string | null;
    reverses_id: string | null;
  }>(
    `select id, site_id, entry_date, category, amount_paise, note, reverses_id from mirror_cash_entries
      where site_id = ? order by entry_date desc, id`,
    [siteId],
  );
  return rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    entryDate: r.entry_date,
    category: r.category,
    amountPaise: r.amount_paise,
    note: r.note,
    reversesId: r.reverses_id,
  }));
}

/** Every worker the roster mirror holds for a site, once each, by name. */
export async function readSiteWorkers(db: DeviceDb, userId: string, siteId: string): Promise<RosterWorker[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{ worker_id: string; site_id: string; code: string; name: string; trade: string }>(
    `select worker_id, site_id, min(code) as code, min(name) as name, min(trade) as trade
       from mirror_roster where site_id = ? group by worker_id, site_id order by min(name), worker_id`,
    [siteId],
  );
  return rows.map((r) => ({ workerId: r.worker_id, siteId: r.site_id, code: r.code, name: r.name, trade: r.trade }));
}

/** One worker's assignments at a site: the days they were on its roster, both ends inclusive (ADR-021 D10). */
export async function readWorkerAssignments(
  db: DeviceDb,
  userId: string,
  siteId: string,
  workerId: string,
): Promise<{ assignedOn: string; unassignedOn: string | null }[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{ assigned_on: string; unassigned_on: string | null }>(
    `select assigned_on, unassigned_on from mirror_roster where site_id = ? and worker_id = ? order by assigned_on`,
    [siteId, workerId],
  );
  return rows.map((r) => ({ assignedOn: r.assigned_on, unassignedOn: r.unassigned_on }));
}

/** The Asia/Kolkata calendar day (YYYY-MM-DD) of a timestamp. India has no daylight saving. */
export function istDate(timestamp: string): string {
  // Postgres can send microseconds; trim to the milliseconds every date parser reads.
  const ms = Date.parse(timestamp.replace(/(\.\d{3})\d+/, '$1'));
  if (!Number.isFinite(ms)) throw new Error('not a timestamp');
  return new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

async function fetchAll<T>(
  source: MirrorSource,
  kind: MirrorKind,
  userId: string,
  pageSize: number,
  parse: (row: unknown) => T,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const got = await source.fetchPage(kind, userId, after, pageSize);
    // An empty page is the only end: a server may cap a page below what was asked
    // for, so a short page does not mean there is no more.
    if (got.length === 0) return rows;
    for (const row of got) rows.push(parse(row));
    const last: unknown = (got[got.length - 1] as Record<string, unknown> | null)?.[KEY_FIELD[kind]];
    // The cursor must move forward, or the same page would come back forever.
    if (typeof last !== 'string' || last === after) throw new PullError('bad_paging');
    after = last;
  }
  throw new PullError('bad_paging');
}

async function ownedBy(db: DeviceDb, userId: string): Promise<boolean> {
  const info = await mirrorInfo(db);
  return info !== null && info.userId === userId.toLowerCase();
}

/**
 * The month view, the advances and the cash entries are the newest sources and the only ones a missing
 * view or table can break, so they must not block the others: if one fails, the pull goes on without it and keeps
 * the old rows (ADR-053). A changed session still stops the whole pull.
 */
async function fetchOptional<T>(
  source: MirrorSource,
  kind: MirrorKind,
  userId: string,
  pageSize: number,
  parse: (row: unknown) => T,
): Promise<T[] | null> {
  try {
    return await fetchAll(source, kind, userId, pageSize, parse);
  } catch (error) {
    if (reasonOf(error) === SESSION_CHANGED) throw error;
    return null;
  }
}

async function deleteMirrors(db: DeviceDb, keepMonth = false, keepAdvances = false, keepCash = false): Promise<void> {
  await db.run(`delete from mirror_sites`);
  await db.run(`delete from mirror_materials`);
  await db.run(`delete from mirror_roster`);
  await db.run(`delete from mirror_approved_days`);
  await db.run(`delete from mirror_report_status`);
  if (!keepMonth) await db.run(`delete from mirror_month_entries`);
  if (!keepAdvances) await db.run(`delete from mirror_advances`);
  if (!keepCash) await db.run(`delete from mirror_cash_entries`);
  await db.run(`delete from mirror_state`);
}

function reasonOf(error: unknown): string {
  if (error instanceof SyncTransportError) return error.reason;
  if (error instanceof PullError) return error.message;
  // Anything else is a local failure; its message can name files or data.
  return 'local_error';
}

// ---- parsing: every row is checked before anything is replaced

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length === 36;
const isText = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A number, or a numeric sent as a string; never null, '' or anything else. */
function toNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return isNum(n) ? n : undefined;
}

/** A numeric(…, 3) from PostgREST, as exact integer thousandths. */
function toMilli(v: unknown): number | undefined {
  const n = toNumber(v);
  return n === undefined ? undefined : Math.round(n * 1000);
}

/** A numeric(4,2) of overtime hours as exact integer hundredths. More than two decimals, or outside 0 to 8, is refused. */
function toHundredths(v: unknown): number | undefined {
  const n = toNumber(v);
  if (n === undefined) return undefined;
  const hundredths = Math.round(n * 100);
  return Math.abs(n * 100 - hundredths) < 1e-6 && hundredths >= 0 && hundredths <= 800 ? hundredths : undefined;
}

function bad(kind: MirrorKind): never {
  throw new PullError(`bad_row:${kind}`);
}

function toSite(v: unknown): MirrorSite {
  const latitude = isRow(v) ? toNumber(v.latitude) : undefined;
  const longitude = isRow(v) ? toNumber(v.longitude) : undefined;
  if (
    !isRow(v) ||
    !isId(v.id) ||
    !isId(v.org_id) ||
    !isText(v.name) ||
    !isText(v.address) ||
    latitude === undefined ||
    longitude === undefined ||
    !isNum(v.geofence_radius_m) ||
    !isText(v.status)
  ) {
    return bad('sites');
  }
  return {
    id: v.id.toLowerCase(),
    orgId: v.org_id.toLowerCase(),
    name: v.name,
    address: v.address,
    latitude,
    longitude,
    geofenceRadiusM: v.geofence_radius_m,
    status: v.status,
  };
}

function toMaterial(v: unknown): MirrorMaterial & { siteId: string } {
  if (!isRow(v) || !isId(v.material_id) || !isId(v.site_id) || !isText(v.name) || !isText(v.unit)) {
    return bad('materials');
  }
  const balanceMilli = toMilli(v.balance);
  const thresholdMilli = v.low_stock_threshold === null ? null : toMilli(v.low_stock_threshold);
  if (balanceMilli === undefined || thresholdMilli === undefined) return bad('materials');
  return {
    id: v.material_id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    name: v.name,
    unit: v.unit,
    thresholdMilli,
    balanceMilli,
  };
}

function toAssignment(v: unknown): AssignmentRow {
  if (
    !isRow(v) ||
    !isId(v.assignment_id) ||
    !isId(v.worker_id) ||
    !isId(v.site_id) ||
    !isText(v.worker_code) ||
    !isText(v.name) ||
    !isText(v.trade) ||
    !isText(v.assigned_at) ||
    !(v.unassigned_at === null || isText(v.unassigned_at))
  ) {
    return bad('roster');
  }
  let assignedOn: string;
  let unassignedOn: string | null;
  try {
    assignedOn = istDate(v.assigned_at);
    unassignedOn = v.unassigned_at === null ? null : istDate(v.unassigned_at);
  } catch {
    return bad('roster');
  }
  return {
    assignmentId: v.assignment_id.toLowerCase(),
    workerId: v.worker_id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    code: v.worker_code,
    name: v.name,
    trade: v.trade,
    assignedOn,
    unassignedOn,
  };
}

/** A real calendar day (YYYY-MM-DD), not just ten characters. */
function isCalendarDay(v: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(`${v}T00:00:00Z`)) &&
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
  );
}

/** Refuses anything but a month written YYYY-MM. */
export function assertMonth(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM');
}

function toApprovedDay(v: unknown): ApprovedRow {
  if (
    !isRow(v) ||
    !isId(v.entry_id) ||
    !isId(v.site_id) ||
    !isId(v.worker_id) ||
    !isText(v.work_date) ||
    !isApprovedStatus(v.status) ||
    !isText(v.approved_at)
  ) {
    return bad('approved_days');
  }
  const overtimeHundredths = toHundredths(v.overtime_hours);
  // A timestamp Postgres could have sent.
  const dayOk = isCalendarDay(v.work_date);
  const approvedOk = Number.isFinite(Date.parse(v.approved_at.replace(/(\.\d{3})\d+/, '$1')));
  if (overtimeHundredths === undefined || !dayOk || !approvedOk) return bad('approved_days');
  return {
    entryId: v.entry_id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    workerId: v.worker_id.toLowerCase(),
    workDate: v.work_date,
    status: v.status,
    overtimeHours: overtimeHundredths / 100,
    overtimeHundredths,
    approvedAt: v.approved_at,
  };
}

function toMonthEntry(v: unknown): MonthRow {
  if (
    !isRow(v) ||
    !isId(v.entry_id) ||
    !isId(v.site_id) ||
    !isId(v.worker_id) ||
    !isText(v.work_date) ||
    !isApprovedStatus(v.status) ||
    !isDayStatus(v.day_status)
  ) {
    return bad('month_entries');
  }
  const overtimeHundredths = toHundredths(v.overtime_hours);
  if (overtimeHundredths === undefined || !isCalendarDay(v.work_date)) return bad('month_entries');
  return {
    entryId: v.entry_id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    workerId: v.worker_id.toLowerCase(),
    workDate: v.work_date,
    status: v.status,
    overtimeHours: overtimeHundredths / 100,
    overtimeHundredths,
    dayStatus: v.day_status,
  };
}

function toMirroredAdvance(v: unknown): MirroredAdvance {
  if (
    !isRow(v) ||
    !isId(v.id) ||
    !isId(v.site_id) ||
    !isId(v.worker_id) ||
    !isText(v.paid_on) ||
    !isCalendarDay(v.paid_on) ||
    !isNum(v.amount_paise) ||
    !Number.isSafeInteger(v.amount_paise) ||
    v.amount_paise <= 0 ||
    !(v.note === null || isText(v.note)) ||
    !(v.reverses_id === null || isId(v.reverses_id))
  ) {
    return bad('advances');
  }
  return {
    id: v.id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    workerId: v.worker_id.toLowerCase(),
    paidOn: v.paid_on,
    amountPaise: v.amount_paise,
    note: v.note,
    reversesId: v.reverses_id === null ? null : v.reverses_id.toLowerCase(),
  };
}

function toMirroredCashEntry(v: unknown): MirroredCashEntry {
  if (
    !isRow(v) ||
    !isId(v.id) ||
    !isId(v.site_id) ||
    !isText(v.entry_date) ||
    !isCalendarDay(v.entry_date) ||
    !isCashCategory(v.category) ||
    !isNum(v.amount_paise) ||
    !Number.isSafeInteger(v.amount_paise) ||
    v.amount_paise <= 0 ||
    !(v.note === null || isText(v.note)) ||
    !(v.reverses_id === null || isId(v.reverses_id))
  ) {
    return bad('cash_entries');
  }
  return {
    id: v.id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    entryDate: v.entry_date,
    category: v.category,
    amountPaise: v.amount_paise,
    note: v.note,
    reversesId: v.reverses_id === null ? null : v.reverses_id.toLowerCase(),
  };
}

const nonBlank = (text: string | null): string | null => (text === null || text.trim() === '' ? null : text);

function toReportStatus(v: unknown): ReportStatus {
  if (
    !isRow(v) ||
    !isId(v.id) ||
    !isId(v.site_id) ||
    !isText(v.report_date) ||
    !isReportServerStatus(v.status) ||
    !(v.review_note === null || isText(v.review_note)) ||
    !(v.reviewed_at === null || isText(v.reviewed_at)) ||
    !(v.headcount === null || (typeof v.headcount === 'number' && Number.isInteger(v.headcount))) ||
    !(v.work_done === null || isText(v.work_done)) ||
    !(v.blockers === null || isText(v.blockers)) ||
    !(v.next_day_plan === null || isText(v.next_day_plan)) ||
    typeof v.serious_blocker !== 'boolean' ||
    typeof v.safety_incident !== 'boolean'
  ) {
    return bad('report_status');
  }
  const dayOk = isCalendarDay(v.report_date);
  const reviewedOk = v.reviewed_at === null || Number.isFinite(Date.parse(v.reviewed_at.replace(/(\.\d{3})\d+/, '$1')));
  if (!dayOk || !reviewedOk) return bad('report_status');
  return {
    id: v.id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    reportDate: v.report_date,
    status: v.status,
    reviewNote: nonBlank(v.review_note),
    reviewedAt: v.reviewed_at,
    headcount: v.headcount,
    workDone: nonBlank(v.work_done),
    blockers: nonBlank(v.blockers),
    nextDayPlan: nonBlank(v.next_day_plan),
    seriousBlocker: v.serious_blocker,
    safetyIncident: v.safety_incident,
  };
}

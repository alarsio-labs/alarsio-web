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

import type { DeviceDb } from '../db/device-db';
import { SESSION_CHANGED, SyncTransportError } from './sender';

/** The page the phone asks for. A server may return fewer: its own cap can be lower. */
export const PULL_PAGE_SIZE = 1000;
/** A safety stop, far above any real size, so a misbehaving server cannot loop a pull forever. */
const MAX_PAGES = 1000;

export type MirrorKind = 'sites' | 'materials' | 'roster' | 'approved_days';

/** The column each source is ordered and paged by. */
const KEY_FIELD: Record<MirrorKind, string> = {
  sites: 'id',
  materials: 'material_id',
  roster: 'assignment_id',
  approved_days: 'entry_id',
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
  | { kind: 'done'; sites: number; materials: number; roster: number; approvedDays: number }
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
  try {
    userId = await source.currentUserId();
    if (userId === null) return { kind: 'signed_out' };
    sites = (await fetchAll(source, 'sites', userId, pageSize, toSite)).filter((s) => s.status !== 'archived');
    materials = await fetchAll(source, 'materials', userId, pageSize, toMaterial);
    roster = await fetchAll(source, 'roster', userId, pageSize, toAssignment);
    approved = await fetchAll(source, 'approved_days', userId, pageSize, toApprovedDay);

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

  const owner = userId.toLowerCase();
  try {
    await db.transaction(async () => {
      await deleteMirrors(db);
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
      await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [
        owner,
        now().toISOString(),
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
  };
}

/** Whose mirror this is, and when it was refreshed; null before the first pull. */
export async function mirrorInfo(db: DeviceDb): Promise<{ userId: string; refreshedAt: string } | null> {
  const [row] = await db.all<{ user_id: string; refreshed_at: string }>(
    `select user_id, refreshed_at from mirror_state where id = 1`,
  );
  return row ? { userId: row.user_id, refreshedAt: row.refreshed_at } : null;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
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

async function deleteMirrors(db: DeviceDb): Promise<void> {
  await db.run(`delete from mirror_sites`);
  await db.run(`delete from mirror_materials`);
  await db.run(`delete from mirror_roster`);
  await db.run(`delete from mirror_approved_days`);
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
  // A real calendar day, not just ten characters, and a timestamp Postgres could have sent.
  const dayOk =
    /^\d{4}-\d{2}-\d{2}$/.test(v.work_date) &&
    Number.isFinite(Date.parse(`${v.work_date}T00:00:00Z`)) &&
    new Date(`${v.work_date}T00:00:00Z`).toISOString().slice(0, 10) === v.work_date;
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

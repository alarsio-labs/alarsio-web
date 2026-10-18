// Pull: copies what the signed-in user may see onto the phone, so capture
// screens work with no signal. Owner: Offline Sync (Nikhil). Issue #49.
//
// Full refresh, not incremental: when a supervisor is taken off a site, RLS
// simply stops returning it, and only a full refresh can notice that. The data
// is small (a few sites, dozens of materials, hundreds of workers).
//
// A pull replaces every mirror in one transaction, and only when every page of
// every source arrived and parsed; otherwise the old mirror stays whole. The
// server is reached through a MirrorSource, so every path is tested offline.

import type { DeviceDb } from '../db/device-db';
import { SyncTransportError } from './sender';

/** PostgREST's default row cap. A page this full means there may be more. */
export const PULL_PAGE_SIZE = 1000;

export type MirrorKind = 'sites' | 'materials' | 'roster';

export interface MirrorSource {
  /** The signed-in user's id, or null when no one is signed in. */
  currentUserId(): Promise<string | null>;
  /**
   * Rows `from`..`to` (both included) of one source, in a stable order, read
   * under `userId`'s session only. Throws SyncTransportError('session_changed')
   * if someone else is signed in by now, or another SyncTransportError on failure.
   */
  fetchPage(kind: MirrorKind, userId: string, from: number, to: number): Promise<unknown[]>;
}

export type PullResult =
  | { kind: 'signed_out' }
  | { kind: 'done'; sites: number; materials: number; roster: number }
  | { kind: 'failed'; reason: string };

export interface MirrorSite {
  id: string;
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

export interface MirrorWorker {
  assignmentId: string;
  workerId: string;
  siteId: string;
  code: string;
  name: string;
  trade: string;
}

class BadRow extends Error {
  constructor(readonly kind: MirrorKind) {
    super(`bad_row:${kind}`);
  }
}

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
  let roster: MirrorWorker[];
  try {
    userId = await source.currentUserId();
    if (userId === null) return { kind: 'signed_out' };
    sites = (await fetchAll(source, 'sites', userId, pageSize)).map(toSite);
    materials = (await fetchAll(source, 'materials', userId, pageSize)).map(toMaterial);
    roster = (await fetchAll(source, 'roster', userId, pageSize)).map(toWorker);
  } catch (error) {
    return { kind: 'failed', reason: reasonOf(error) };
  }

  const owner = userId.toLowerCase();
  await db.transaction(async () => {
    await deleteMirrors(db);
    for (const s of sites) {
      await db.run(
        `insert into mirror_sites (id, name, address, latitude, longitude, geofence_radius_m, status)
         values (?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.name, s.address, s.latitude, s.longitude, s.geofenceRadiusM, s.status],
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
        `insert into mirror_roster (assignment_id, worker_id, site_id, code, name, trade)
         values (?, ?, ?, ?, ?, ?)`,
        [w.assignmentId, w.workerId, w.siteId, w.code, w.name, w.trade],
      );
    }
    await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [
      owner,
      now().toISOString(),
    ]);
  });
  return { kind: 'done', sites: sites.length, materials: materials.length, roster: roster.length };
}

/** Whose mirror this is, and when it was refreshed; null before the first pull. */
export async function mirrorInfo(db: DeviceDb): Promise<{ userId: string; refreshedAt: string } | null> {
  const [row] = await db.all<{ user_id: string; refreshed_at: string }>(
    `select user_id, refreshed_at from mirror_state where id = 1`,
  );
  return row ? { userId: row.user_id, refreshedAt: row.refreshed_at } : null;
}

/** Empties every mirror. For sign-out on a shared phone (#56). */
export async function clearMirrors(db: DeviceDb): Promise<void> {
  await db.transaction(() => deleteMirrors(db));
}

export async function readSites(db: DeviceDb, userId: string): Promise<MirrorSite[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    geofence_radius_m: number;
    status: string;
  }>(`select id, name, address, latitude, longitude, geofence_radius_m, status from mirror_sites order by name, id`);
  return rows.map((r) => ({
    id: r.id,
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

/** Today's roster for one site: open assignments of active workers. */
export async function readRoster(db: DeviceDb, userId: string, siteId: string): Promise<MirrorWorker[]> {
  if (!(await ownedBy(db, userId))) return [];
  const rows = await db.all<{
    assignment_id: string;
    worker_id: string;
    site_id: string;
    code: string;
    name: string;
    trade: string;
  }>(
    `select assignment_id, worker_id, site_id, code, name, trade from mirror_roster
      where site_id = ? order by name, assignment_id`,
    [siteId],
  );
  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    workerId: r.worker_id,
    siteId: r.site_id,
    code: r.code,
    name: r.name,
    trade: r.trade,
  }));
}

async function fetchAll(source: MirrorSource, kind: MirrorKind, userId: string, pageSize: number) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await source.fetchPage(kind, userId, from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function ownedBy(db: DeviceDb, userId: string): Promise<boolean> {
  const info = await mirrorInfo(db);
  return info !== null && info.userId === userId.toLowerCase();
}

async function deleteMirrors(db: DeviceDb): Promise<void> {
  await db.run(`delete from mirror_sites`);
  await db.run(`delete from mirror_materials`);
  await db.run(`delete from mirror_roster`);
  await db.run(`delete from mirror_state`);
}

function reasonOf(error: unknown): string {
  if (error instanceof SyncTransportError) return error.reason;
  if (error instanceof BadRow) return error.message;
  return error instanceof Error ? error.message : String(error);
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

function toSite(v: unknown): MirrorSite {
  const latitude = isRow(v) ? toNumber(v.latitude) : undefined;
  const longitude = isRow(v) ? toNumber(v.longitude) : undefined;
  if (
    !isRow(v) ||
    !isId(v.id) ||
    !isText(v.name) ||
    !isText(v.address) ||
    latitude === undefined ||
    longitude === undefined ||
    !isNum(v.geofence_radius_m) ||
    !isText(v.status)
  ) {
    throw new BadRow('sites');
  }
  return {
    id: v.id.toLowerCase(),
    name: v.name,
    address: v.address,
    latitude,
    longitude,
    geofenceRadiusM: v.geofence_radius_m,
    status: v.status,
  };
}

function toMaterial(v: unknown): MirrorMaterial {
  if (!isRow(v) || !isId(v.material_id) || !isId(v.site_id) || !isText(v.name) || !isText(v.unit)) {
    throw new BadRow('materials');
  }
  const balanceMilli = toMilli(v.balance);
  const thresholdMilli = v.low_stock_threshold === null ? null : toMilli(v.low_stock_threshold);
  if (balanceMilli === undefined || thresholdMilli === undefined) throw new BadRow('materials');
  return {
    id: v.material_id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    name: v.name,
    unit: v.unit,
    thresholdMilli,
    balanceMilli,
  };
}

function toWorker(v: unknown): MirrorWorker {
  if (
    !isRow(v) ||
    !isId(v.assignment_id) ||
    !isId(v.worker_id) ||
    !isId(v.site_id) ||
    !isText(v.worker_code) ||
    !isText(v.name) ||
    !isText(v.trade)
  ) {
    throw new BadRow('roster');
  }
  return {
    assignmentId: v.assignment_id.toLowerCase(),
    workerId: v.worker_id.toLowerCase(),
    siteId: v.site_id.toLowerCase(),
    code: v.worker_code,
    name: v.name,
    trade: v.trade,
  };
}

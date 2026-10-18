import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { readUserVersion } from '../../db/run-migrations';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import {
  clearMirrors,
  mirrorInfo,
  PULL_PAGE_SIZE,
  readMaterials,
  readRoster,
  readSites,
  runPull,
  type MirrorKind,
  type MirrorSource,
} from '../pull';
import { SESSION_CHANGED, SyncTransportError } from '../sender';

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const T0 = new Date('2026-10-20T08:00:00.000Z');
const ID = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SITE_1 = ID('51000000', 1);
const SITE_2 = ID('51000000', 2);

const site = (id: string, name = 'Site') => ({
  id,
  name,
  address: 'Pune',
  latitude: 18.52,
  longitude: 73.85,
  geofence_radius_m: 200,
  status: 'active',
});
const material = (n: number, siteId = SITE_1, balance = 10, threshold: number | null = 5) => ({
  material_id: ID('a1000000', n),
  site_id: siteId,
  name: `Material ${n}`,
  unit: 'bag',
  low_stock_threshold: threshold,
  balance,
});
const worker = (n: number, siteId = SITE_1) => ({
  assignment_id: ID('a5000000', n),
  worker_id: ID('77000000', n),
  site_id: siteId,
  worker_code: `W-${n}`,
  name: `Worker ${n}`,
  trade: 'mason',
});

type Data = Record<MirrorKind, unknown[]>;

/** A server as one user sees it. Pages like PostgREST's .range(from, to), both ends included. */
function fakeSource(data: Data, user: string | null = USER_A) {
  const calls: { kind: MirrorKind; userId: string; from: number; to: number }[] = [];
  const state = { user, data, fail: null as null | { kind: MirrorKind; error: Error } };
  const source: MirrorSource = {
    currentUserId: async () => state.user,
    fetchPage: async (kind, userId, from, to) => {
      calls.push({ kind, userId, from, to });
      if (state.fail?.kind === kind) throw state.fail.error;
      if (userId !== state.user) throw new SyncTransportError(SESSION_CHANGED);
      return state.data[kind].slice(from, to + 1);
    },
  };
  return { source, calls, state };
}

const oneOfEach = (): Data => ({ sites: [site(SITE_1, 'Kothrud')], materials: [material(1)], roster: [worker(1)] });

describe('pull (#49)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it('device migration 4 adds the mirrors on a phone that already has 1 to 3', async () => {
    const old = await openTestDeviceDb();
    await prepareDeviceDb(old, deviceMigrations.slice(0, 3));
    await prepareDeviceDb(old, deviceMigrations);
    expect(await readUserVersion(old)).toBe(deviceMigrations.length);
    expect(await mirrorInfo(old)).toBeNull();
  });

  it("stores the signed-in user's sites, materials and roster, and reads them back", async () => {
    const { source } = fakeSource(oneOfEach());

    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'done', sites: 1, materials: 1, roster: 1 });

    expect(await mirrorInfo(db)).toEqual({ userId: USER_A, refreshedAt: T0.toISOString() });
    expect(await readSites(db, USER_A)).toEqual([
      {
        id: SITE_1,
        name: 'Kothrud',
        address: 'Pune',
        latitude: 18.52,
        longitude: 73.85,
        geofenceRadiusM: 200,
        status: 'active',
      },
    ]);
    expect(await readMaterials(db, USER_A, SITE_1)).toEqual([
      { id: ID('a1000000', 1), siteId: SITE_1, name: 'Material 1', unit: 'bag', thresholdMilli: 5000, balanceMilli: 10000 },
    ]);
    expect(await readRoster(db, USER_A, SITE_1)).toEqual([
      { assignmentId: ID('a5000000', 1), workerId: ID('77000000', 1), siteId: SITE_1, code: 'W-1', name: 'Worker 1', trade: 'mason' },
    ]);
  });

  it('keeps quantities exact, as integer thousandths', async () => {
    const { source } = fakeSource({
      sites: [site(SITE_1)],
      materials: [material(1, SITE_1, 27.5, null), material(2, SITE_1, 0.001, 0.1), material(3, SITE_1, -12.345, 0)],
      roster: [],
    });
    await runPull(db, source, { now: () => T0 });

    const byName = Object.fromEntries((await readMaterials(db, USER_A)).map((m) => [m.name, m]));
    expect(byName['Material 1']).toMatchObject({ balanceMilli: 27500, thresholdMilli: null });
    expect(byName['Material 2']).toMatchObject({ balanceMilli: 1, thresholdMilli: 100 });
    expect(byName['Material 3']).toMatchObject({ balanceMilli: -12345, thresholdMilli: 0 });
  });

  it('pages past the 1000-row cap, so nothing is dropped silently', async () => {
    const roster = Array.from({ length: 2500 }, (_, i) => worker(i + 1));
    const { source, calls } = fakeSource({ sites: [site(SITE_1)], materials: [], roster });

    expect(await runPull(db, source, { now: () => T0 })).toMatchObject({ kind: 'done', roster: 2500 });

    expect(PULL_PAGE_SIZE).toBe(1000);
    expect(calls.filter((c) => c.kind === 'roster').map((c) => [c.from, c.to])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(await readRoster(db, USER_A, SITE_1)).toHaveLength(2500);
  });

  it('drops what the server no longer shows, such as a site the supervisor was taken off', async () => {
    const { source, state } = fakeSource({
      sites: [site(SITE_1), site(SITE_2)],
      materials: [material(1, SITE_1), material(2, SITE_2)],
      roster: [worker(1, SITE_1), worker(2, SITE_2)],
    });
    await runPull(db, source, { now: () => T0 });
    state.data = oneOfEach();

    await runPull(db, source, { now: () => T0 });

    expect((await readSites(db, USER_A)).map((s) => s.id)).toEqual([SITE_1]);
    expect(await readMaterials(db, USER_A, SITE_2)).toEqual([]);
    expect(await readRoster(db, USER_A, SITE_2)).toEqual([]);
  });

  it('keeps the old mirror whole when any part of a pull fails', async () => {
    const { source, state } = fakeSource(oneOfEach());
    await runPull(db, source, { now: () => T0 });
    state.data = { sites: [site(SITE_2)], materials: [], roster: [] };
    state.fail = { kind: 'roster', error: new SyncTransportError('network') };

    expect(await runPull(db, source, { now: () => new Date(T0.getTime() + 1000) })).toEqual({
      kind: 'failed',
      reason: 'network',
    });

    expect((await readSites(db, USER_A)).map((s) => s.id)).toEqual([SITE_1]);
    expect(await readMaterials(db, USER_A)).toHaveLength(1);
    expect(await mirrorInfo(db)).toEqual({ userId: USER_A, refreshedAt: T0.toISOString() });
  });

  it('fails without storing anything when the user changes mid-pull', async () => {
    const { source, state } = fakeSource(oneOfEach());
    const realFetch = source.fetchPage;
    source.fetchPage = async (kind, userId, from, to) => {
      if (kind === 'materials') state.user = USER_B; // B signs in after the sites page
      return realFetch(kind, userId, from, to);
    };

    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: SESSION_CHANGED });
    expect(await mirrorInfo(db)).toBeNull();
    expect(await readSites(db, USER_A)).toEqual([]);
  });

  it('fetches nothing while signed out', async () => {
    const { source, calls } = fakeSource(oneOfEach(), null);
    expect(await runPull(db, source)).toEqual({ kind: 'signed_out' });
    expect(calls).toEqual([]);
  });

  it("never shows one user's mirror to another, on a shared phone", async () => {
    const { source, state } = fakeSource(oneOfEach());
    await runPull(db, source, { now: () => T0 });

    expect(await readSites(db, USER_B)).toEqual([]);
    expect(await readMaterials(db, USER_B)).toEqual([]);
    expect(await readRoster(db, USER_B, SITE_1)).toEqual([]);

    state.user = USER_B;
    state.data = { sites: [site(SITE_2)], materials: [], roster: [] };
    await runPull(db, source, { now: () => T0 });
    expect(await readSites(db, USER_A)).toEqual([]);
    expect((await readSites(db, USER_B)).map((s) => s.id)).toEqual([SITE_2]);
  });

  it('refuses a malformed row and keeps the old mirror', async () => {
    const { source, state } = fakeSource(oneOfEach());
    await runPull(db, source, { now: () => T0 });
    state.data = { ...oneOfEach(), materials: [{ ...material(9), balance: 'lots' }] };

    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: 'bad_row:materials' });
    expect((await readMaterials(db, USER_A)).map((m) => m.name)).toEqual(['Material 1']);
  });

  it('refuses a null coordinate instead of storing it as 0', async () => {
    const { source } = fakeSource({ ...oneOfEach(), sites: [{ ...site(SITE_1), latitude: null }] });
    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: 'bad_row:sites' });
  });

  it('accepts numerics sent as strings', async () => {
    const { source } = fakeSource({
      sites: [{ ...site(SITE_1), latitude: '18.520000', longitude: '73.850000' }],
      materials: [{ ...material(1), balance: '27.500', low_stock_threshold: '5.000' }],
      roster: [],
    });
    await runPull(db, source, { now: () => T0 });
    expect((await readSites(db, USER_A))[0]).toMatchObject({ latitude: 18.52, longitude: 73.85 });
    expect((await readMaterials(db, USER_A))[0]).toMatchObject({ balanceMilli: 27500, thresholdMilli: 5000 });
  });

  it('clearMirrors empties everything, for sign-out', async () => {
    const { source } = fakeSource(oneOfEach());
    await runPull(db, source, { now: () => T0 });

    await clearMirrors(db);

    expect(await mirrorInfo(db)).toBeNull();
    expect(await db.all('select * from mirror_sites')).toEqual([]);
    expect(await db.all('select * from mirror_materials')).toEqual([]);
    expect(await db.all('select * from mirror_roster')).toEqual([]);
  });
});

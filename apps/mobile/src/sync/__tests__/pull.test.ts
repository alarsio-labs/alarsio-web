import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { readUserVersion } from '../../db/run-migrations';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import {
  clearMirrors,
  istDate,
  mirrorInfo,
  mirrorSummary,
  PULL_PAGE_SIZE,
  readMaterials,
  readRosterOn,
  readSites,
  runPull,
  type MirrorKind,
  type MirrorSource,
} from '../pull';
import { enqueue } from '../outbox';
import { SESSION_CHANGED, SyncTransportError } from '../sender';

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const T0 = new Date('2026-10-20T08:00:00.000Z');
const ID = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SITE_1 = ID('51000000', 1);
const SITE_2 = ID('51000000', 2);

const site = (id: string, name = 'Site', status = 'active') => ({
  id,
  name,
  address: 'Pune',
  status,
  latitude: 18.52,
  longitude: 73.85,
  geofence_radius_m: 200,
});
const material = (n: number, siteId = SITE_1, balance: unknown = 10, threshold: unknown = 5) => ({
  material_id: ID('a1000000', n),
  site_id: siteId,
  name: `Material ${n}`,
  unit: 'bag',
  low_stock_threshold: threshold,
  balance,
});
const worker = (n: number, siteId = SITE_1, assignedAt = '2026-10-01T04:00:00+00:00', unassignedAt: string | null = null) => ({
  assignment_id: ID('a5000000', n),
  worker_id: ID('77000000', n),
  site_id: siteId,
  worker_code: `W-${n}`,
  name: `Worker ${n}`,
  trade: 'mason',
  assigned_at: assignedAt,
  unassigned_at: unassignedAt,
});

type Data = Record<MirrorKind, Record<string, unknown>[]>;
const KEY: Record<MirrorKind, string> = { sites: 'id', materials: 'material_id', roster: 'assignment_id' };

/**
 * A server as one user sees it, paging like PostgREST with `.gt(key, after)`,
 * `.order(key)` and `.limit(limit)`. `cap` is the server's own row cap, which can
 * be lower than the page the phone asks for.
 */
function fakeSource(data: Data, user: string | null = USER_A, cap = Infinity) {
  const calls: { kind: MirrorKind; userId: string; after: string | null; limit: number }[] = [];
  const state = {
    user,
    data,
    cap,
    fail: null as null | { kind: MirrorKind; error: Error },
    onPage: null as null | ((kind: MirrorKind, pageNo: number) => void),
  };
  const pages: Record<string, number> = {};
  const source: MirrorSource = {
    currentUserId: async () => state.user,
    fetchPage: async (kind, userId, after, limit) => {
      calls.push({ kind, userId, after, limit });
      pages[kind] = (pages[kind] ?? 0) + 1;
      state.onPage?.(kind, pages[kind]!);
      if (state.fail?.kind === kind) throw state.fail.error;
      if (userId !== state.user) throw new SyncTransportError(SESSION_CHANGED);
      return [...state.data[kind]]
        .sort((a, b) => String(a[KEY[kind]]).localeCompare(String(b[KEY[kind]])))
        .filter((row) => after === null || String(row[KEY[kind]]) > after)
        .slice(0, Math.min(limit, state.cap));
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
      { id: SITE_1, name: 'Kothrud', address: 'Pune', latitude: 18.52, longitude: 73.85, geofenceRadiusM: 200, status: 'active' },
    ]);
    expect(await readMaterials(db, USER_A, SITE_1)).toEqual([
      { id: ID('a1000000', 1), siteId: SITE_1, name: 'Material 1', unit: 'bag', thresholdMilli: 5000, balanceMilli: 10000 },
    ]);
    expect(await readRosterOn(db, USER_A, SITE_1, '2026-10-20')).toEqual([
      { workerId: ID('77000000', 1), siteId: SITE_1, code: 'W-1', name: 'Worker 1', trade: 'mason' },
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

  it('accepts numerics sent as strings', async () => {
    const { source } = fakeSource({
      sites: [{ ...site(SITE_1), latitude: '18.520000', longitude: '73.850000' }],
      materials: [material(1, SITE_1, '27.500', '5.000')],
      roster: [],
    });
    await runPull(db, source, { now: () => T0 });
    expect((await readSites(db, USER_A))[0]).toMatchObject({ latitude: 18.52, longitude: 73.85 });
    expect((await readMaterials(db, USER_A))[0]).toMatchObject({ balanceMilli: 27500, thresholdMilli: 5000 });
  });

  describe('paging by key', () => {
    const roster = (count: number) => Array.from({ length: count }, (_, i) => worker(i + 1));

    it('pages past the 1000-row cap with the last key as the cursor, and stops on an empty page', async () => {
      const { source, calls } = fakeSource({ sites: [site(SITE_1)], materials: [], roster: roster(2500) });

      expect(await runPull(db, source, { now: () => T0 })).toMatchObject({ kind: 'done', roster: 2500 });

      expect(PULL_PAGE_SIZE).toBe(1000);
      const afters = calls.filter((c) => c.kind === 'roster').map((c) => c.after);
      expect(afters).toEqual([null, ID('a5000000', 1000), ID('a5000000', 2000), ID('a5000000', 2500)]);
      expect(await readRosterOn(db, USER_A, SITE_1, '2026-10-20')).toHaveLength(2500);
    });

    it('loses nothing when the server caps a page below what was asked for', async () => {
      const { source } = fakeSource({ sites: [site(SITE_1)], materials: [], roster: roster(2500) }, USER_A, 500);

      expect(await runPull(db, source, { now: () => T0 })).toMatchObject({ kind: 'done', roster: 2500 });
    });

    it('is not thrown off by a row deleted, or one added, between pages', async () => {
      const { source, state } = fakeSource({ sites: [site(SITE_1)], materials: [], roster: roster(2500) });
      state.onPage = (kind, pageNo) => {
        if (kind !== 'roster' || pageNo !== 2) return;
        // After page 1 was read: delete a row from it, delete one from the next
        // page, and add one that sorts before the cursor. Offset paging would now
        // skip a row or return the boundary row twice, and fail on a repeated key.
        state.data.roster = state.data.roster.filter(
          (r) => r.assignment_id !== ID('a5000000', 10) && r.assignment_id !== ID('a5000000', 1500),
        );
        state.data.roster.push(worker(0, SITE_1));
      };

      expect(await runPull(db, source, { now: () => T0 })).toMatchObject({ kind: 'done', roster: 2499 });

      const ids = new Set((await readRosterOn(db, USER_A, SITE_1, '2026-10-20')).map((w) => w.workerId));
      expect(ids.has(ID('77000000', 10))).toBe(true); // read before it was deleted
      expect(ids.has(ID('77000000', 1500))).toBe(false); // deleted before its page
      expect(ids.has(ID('77000000', 1001))).toBe(true); // nothing after the cursor is skipped
      expect(ids.has(ID('77000000', 0))).toBe(false); // sorts before the cursor, so not fetched
    });

    it('gives up instead of looping when the cursor does not advance', async () => {
      const stuck: MirrorSource = {
        currentUserId: async () => USER_A,
        fetchPage: async (kind) => (kind === 'sites' ? [site(SITE_1)] : []),
      };

      expect(await runPull(db, stuck, { now: () => T0 })).toEqual({ kind: 'failed', reason: 'bad_paging' });
      expect(await mirrorInfo(db)).toBeNull();
    });
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
    expect(await readRosterOn(db, USER_A, SITE_2, '2026-10-20')).toEqual([]);
  });

  it('leaves out archived sites, and the materials and roster of any site it does not hold', async () => {
    const { source } = fakeSource({
      sites: [site(SITE_1), site(SITE_2, 'Old', 'archived'), site(ID('51000000', 3), 'Done', 'completed')],
      materials: [material(1, SITE_1), material(2, SITE_2), material(3, ID('51000000', 99))],
      roster: [worker(1, SITE_1), worker(2, SITE_2)],
    });

    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'done', sites: 2, materials: 1, roster: 1 });

    // completed stays: can_record_on_site only refuses archived sites.
    expect((await readSites(db, USER_A)).map((s) => s.status).sort()).toEqual(['active', 'completed']);
    expect((await readMaterials(db, USER_A)).map((m) => m.siteId)).toEqual([SITE_1]);
    expect(await readRosterOn(db, USER_A, SITE_2, '2026-10-20')).toEqual([]);
  });

  describe('who is rostered on a date (ADR-021 D10)', () => {
    const rosterNames = async (date: string) =>
      (await readRosterOn(db, USER_A, SITE_1, date)).map((w) => w.code).sort();

    async function pullRoster(rows: ReturnType<typeof worker>[]) {
      const { source } = fakeSource({ sites: [site(SITE_1)], materials: [], roster: rows });
      await runPull(db, source, { now: () => T0 });
    }

    it('counts the assigned day and the unassigned day, both ends inclusive, in the Asia/Kolkata day', async () => {
      await pullRoster([
        worker(1, SITE_1, '2026-10-01T04:00:00+00:00', null), // still assigned
        worker(2, SITE_1, '2026-10-10T04:00:00.123456+00:00', '2026-10-20T05:00:00+00:00'), // left at 10:30 IST on the 20th
      ]);

      expect(await rosterNames('2026-10-09')).toEqual(['W-1']); // 2 not assigned yet
      expect(await rosterNames('2026-10-10')).toEqual(['W-1', 'W-2']);
      expect(await rosterNames('2026-10-20')).toEqual(['W-1', 'W-2']); // the day they left still counts
      expect(await rosterNames('2026-10-21')).toEqual(['W-1']);
    });

    it('takes the day in Asia/Kolkata, not in UTC', async () => {
      // 19:00 UTC on the 19th is 00:30 IST on the 20th, so the worker starts on the 20th.
      await pullRoster([worker(1, SITE_1, '2026-10-19T19:00:00+00:00', null)]);
      expect(await rosterNames('2026-10-19')).toEqual([]);
      expect(await rosterNames('2026-10-20')).toEqual(['W-1']);
    });

    it('lists a worker once even when they hold several assignment rows at the site', async () => {
      const again = { ...worker(1, SITE_1, '2026-10-12T04:00:00+00:00', null), assignment_id: ID('a5000000', 99) };
      await pullRoster([worker(1, SITE_1, '2026-10-01T04:00:00+00:00', '2026-10-05T04:00:00+00:00'), again]);

      expect(await readRosterOn(db, USER_A, SITE_1, '2026-10-13')).toHaveLength(1);
      expect(await readRosterOn(db, USER_A, SITE_1, '2026-10-08')).toEqual([]); // the gap between the two
    });

    it("does not show another user's roster", async () => {
      await pullRoster([worker(1)]);
      expect(await readRosterOn(db, USER_B, SITE_1, '2026-10-20')).toEqual([]);
    });

    it('refuses a timestamp it cannot read, and keeps the old mirror', async () => {
      await pullRoster([worker(1)]);
      const { source } = fakeSource({ ...oneOfEach(), roster: [worker(2, SITE_1, 'not a time', null)] });

      expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: 'bad_row:roster' });
      expect(await rosterNames('2026-10-20')).toEqual(['W-1']);
    });
  });

  it('istDate gives the Asia/Kolkata calendar day of a timestamp', () => {
    expect(istDate('2026-10-20T00:00:00+00:00')).toBe('2026-10-20');
    expect(istDate('2026-10-20T18:29:59Z')).toBe('2026-10-20');
    expect(istDate('2026-10-20T18:30:00Z')).toBe('2026-10-21');
    expect(istDate('2026-10-20T23:59:00-05:00')).toBe('2026-10-21');
    expect(istDate('2026-12-31T20:00:00.123456+00:00')).toBe('2027-01-01');
    expect(() => istDate('nope')).toThrow();
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

  it('turns a failed write into a fixed reason, and keeps the old mirror', async () => {
    const { source } = fakeSource(oneOfEach());
    await runPull(db, source, { now: () => T0 });
    const flaky: DeviceDb = {
      ...db,
      run: async (sql, params) => {
        if (sql.includes('insert into mirror_roster')) throw new Error('UNIQUE constraint failed: /data/user/0/x/alarsio.db');
        return db.run(sql, params);
      },
    };

    const result = await runPull(flaky, source, { now: () => new Date(T0.getTime() + 1000) });

    expect(result).toEqual({ kind: 'failed', reason: 'local_error' });
    expect((await readSites(db, USER_A)).map((s) => s.name)).toEqual(['Kothrud']);
    expect(await mirrorInfo(db)).toEqual({ userId: USER_A, refreshedAt: T0.toISOString() });
  });

  it('fails without storing anything when the user changes mid-pull', async () => {
    const { source, state } = fakeSource(oneOfEach());
    state.onPage = (kind) => {
      if (kind === 'materials') state.user = USER_B; // B signs in after the sites page
    };

    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: SESSION_CHANGED });
    expect(await mirrorInfo(db)).toBeNull();
    expect(await readSites(db, USER_A)).toEqual([]);
  });

  it('stores nothing when the user signed out after the last page, so sign-out cannot be undone', async () => {
    const { source } = fakeSource(oneOfEach());
    let checks = 0;
    // Signed in when the pull starts; gone by the time it is about to write.
    source.currentUserId = async () => (++checks === 1 ? USER_A : null);

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
    expect(await readRosterOn(db, USER_B, SITE_1, '2026-10-20')).toEqual([]);
    expect(await mirrorSummary(db, USER_B)).toBeNull();

    state.user = USER_B;
    state.data = { sites: [site(SITE_2)], materials: [], roster: [] };
    await runPull(db, source, { now: () => T0 });
    expect(await readSites(db, USER_A)).toEqual([]);
    expect((await readSites(db, USER_B)).map((s) => s.id)).toEqual([SITE_2]);
  });

  it('refuses a malformed row, or a null coordinate, and keeps the old mirror', async () => {
    const { source, state } = fakeSource(oneOfEach());
    await runPull(db, source, { now: () => T0 });

    state.data = { ...oneOfEach(), materials: [material(9, SITE_1, 'lots')] };
    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: 'bad_row:materials' });
    expect((await readMaterials(db, USER_A)).map((m) => m.name)).toEqual(['Material 1']);

    state.data = { ...oneOfEach(), sites: [{ ...site(SITE_1), latitude: null }] };
    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: 'bad_row:sites' });
  });

  it('summarises what the phone holds, for its owner only', async () => {
    const { source } = fakeSource({
      sites: [site(SITE_1), site(SITE_2)],
      materials: [material(1, SITE_1), material(2, SITE_2)],
      roster: [worker(1, SITE_1)],
    });
    expect(await mirrorSummary(db, USER_A)).toBeNull();

    await runPull(db, source, { now: () => T0 });

    expect(await mirrorSummary(db, USER_A)).toEqual({
      refreshedAt: T0.toISOString(),
      sites: 2,
      materials: 2,
      roster: 1,
    });
    expect(await mirrorSummary(db, USER_B)).toBeNull();
  });

  it('does not lose a capture saved while the pull is writing, even if the pull rolls back', async () => {
    const { source } = fakeSource(oneOfEach());
    let release!: (fail: boolean) => void;
    const gate = new Promise<boolean>((resolve) => (release = resolve));
    let entered!: () => void;
    const inWrite = new Promise<void>((resolve) => (entered = resolve));
    // A database whose pull write stalls inside its transaction, and then fails.
    const slow: DeviceDb = {
      ...db,
      run: async (sql, params) => {
        if (sql.includes('insert into mirror_state')) {
          entered();
          if (await gate) throw new Error('write failed');
        }
        return db.run(sql, params);
      },
    };

    const pull = runPull(slow, source, { now: () => T0 });
    await inWrite;
    // The supervisor saves a record now: it must wait for the pull's transaction,
    // not join it, or the rollback below would take it away.
    const saving = enqueue(slow, {
      entity: 'material_transactions',
      recordId: ID('c4000000', 1),
      authorId: USER_A,
      payload: { qty: 1 },
    });
    release(true);

    expect(await pull).toEqual({ kind: 'failed', reason: 'local_error' });
    await saving;
    expect((await db.all<{ record_id: string }>('select record_id from outbox')).map((r) => r.record_id)).toEqual([
      ID('c4000000', 1),
    ]);
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

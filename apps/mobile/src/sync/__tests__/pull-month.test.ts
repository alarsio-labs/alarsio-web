import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { readUserVersion } from '../../db/run-migrations';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { clearMirrors, readDayStatus, readMonthEntries, readSites, runPull, type MirrorKind, type MirrorSource } from '../pull';
import { SyncTransportError } from '../sender';

// Issue #234, ADR-053: the month mirror, read from Attendance's view attendance_month_entries.

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const T0 = new Date('2026-11-19T08:00:00.000Z');
const ID = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = ID('51000000', 1);
const SITE_2 = ID('51000000', 2);
const WORKER_1 = ID('77000000', 1);
const WORKER_2 = ID('77000000', 2);

type Rows = Record<string, unknown>[];

const site = (id: string) => ({
  id,
  org_id: ORG,
  name: 'Site',
  address: 'Lucknow',
  status: 'active',
  latitude: 26.9,
  longitude: 80.9,
  geofence_radius_m: 200,
});

let n = 0;
const monthRow = (over: Record<string, unknown> = {}) => ({
  entry_id: ID('e8000000', (n += 1)),
  site_id: SITE_1,
  worker_id: WORKER_1,
  work_date: '2026-11-10',
  status: 'present',
  overtime_hours: 0,
  day_status: 'open',
  ...over,
});

/** A server as USER_A sees it, paging by key like PostgREST. Only the kinds a test gives are non-empty. */
function fakeSource(data: Partial<Record<MirrorKind, Rows>>, user: string | null = USER_A) {
  const state = { user, data, failMonth: false };
  const source: MirrorSource = {
    currentUserId: async () => state.user,
    fetchPage: async (kind, _userId, after, limit) => {
      if (kind === 'month_entries' && state.failMonth) throw new SyncTransportError('network');
      const key = kind === 'sites' ? 'id' : kind === 'month_entries' ? 'entry_id' : 'x';
      return [...(state.data[kind] ?? [])]
        .sort((a, b) => String(a[key]).localeCompare(String(b[key])))
        .filter((r) => after === null || String(r[key]) > after)
        .slice(0, limit);
    },
  };
  return { source, state };
}

describe('month mirror (#234, ADR-053)', () => {
  let db: DeviceDb;
  const pull = async (rows: Rows, user: string | null = USER_A) =>
    runPull(db, fakeSource({ sites: [site(SITE_1)], month_entries: rows }, user).source, { now: () => T0 });

  beforeEach(async () => {
    n = 0;
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it('device migration 9 adds the table, and a phone on version 8 keeps its sites', async () => {
    const old = await openTestDeviceDb();
    await prepareDeviceDb(old, deviceMigrations.slice(0, 8));
    await old.run(
      `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
       values (?, ?, 'Site', 'Lucknow', 26.9, 80.9, 200, 'active')`,
      [SITE_1, ORG],
    );
    await old.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [USER_A, T0.toISOString()]);

    await prepareDeviceDb(old, deviceMigrations);

    expect(await readUserVersion(old)).toBe(9);
    expect(await old.all('select * from mirror_month_entries')).toEqual([]);
    expect((await readSites(old, USER_A)).map((s) => s.id)).toEqual([SITE_1]);
  });

  it('shows nothing before a pull, or from another user\'s mirror', async () => {
    expect(await readMonthEntries(db, USER_A, SITE_1, WORKER_1, '2026-11')).toEqual([]);
    await pull([monthRow()]);
    expect(await readMonthEntries(db, USER_B, SITE_1, WORKER_1, '2026-11')).toEqual([]);
    expect(await readDayStatus(db, USER_B, SITE_1, '2026-11-10')).toBeNull();
  });

  it('returns one worker\'s entries for one month, with overtime as hours', async () => {
    await pull([
      monthRow({ work_date: '2026-11-10', status: 'present', overtime_hours: '2.50' }),
      monthRow({ work_date: '2026-11-09', status: 'half_day' }),
      monthRow({ work_date: '2026-10-31', status: 'leave' }),
      monthRow({ worker_id: WORKER_2, work_date: '2026-11-10' }),
    ]);
    expect(await readMonthEntries(db, USER_A, SITE_1, WORKER_1, '2026-11')).toEqual([
      { workDate: '2026-11-09', status: 'half_day', overtimeHours: 0, dayStatus: 'open' },
      { workDate: '2026-11-10', status: 'present', overtimeHours: 2.5, dayStatus: 'open' },
    ]);
  });

  it('knows a day is approved even when the asked worker has no entry that day', async () => {
    await pull([monthRow({ worker_id: WORKER_2, work_date: '2026-10-28', day_status: 'approved' })]);
    expect(await readDayStatus(db, USER_A, SITE_1, '2026-10-28')).toBe('approved');
    expect(await readMonthEntries(db, USER_A, SITE_1, WORKER_1, '2026-10')).toEqual([]);
  });

  it('says nothing of a day the mirror does not hold, never "open"', async () => {
    await pull([monthRow()]);
    expect(await readDayStatus(db, USER_A, SITE_1, '2026-11-11')).toBeNull();
    expect(await readDayStatus(db, USER_A, SITE_2, '2026-11-10')).toBeNull();
  });

  it('fails the pull and keeps the old mirror when a row cannot be read', async () => {
    await pull([monthRow({ work_date: '2026-11-10' })]);
    for (const bad of [
      { status: 'sick' },
      { day_status: 'locked' },
      { work_date: '10-11-2026' },
      { work_date: '2026-13-45' },
      { overtime_hours: 9 },
      { overtime_hours: 1.234 },
      { entry_id: 'short' },
      { worker_id: null },
    ]) {
      expect(await pull([monthRow(bad)])).toEqual({ kind: 'failed', reason: 'bad_row:month_entries' });
    }
    expect(await readMonthEntries(db, USER_A, SITE_1, WORKER_1, '2026-11')).toHaveLength(1);
  });

  it('keeps the old copy when only the month fetch fails', async () => {
    await pull([monthRow()]);
    const { source, state } = fakeSource({ sites: [site(SITE_1)], month_entries: [] });
    state.failMonth = true;
    expect(await runPull(db, source, { now: () => T0 })).toEqual({ kind: 'failed', reason: 'network' });
    expect(await readMonthEntries(db, USER_A, SITE_1, WORKER_1, '2026-11')).toHaveLength(1);
  });

  it('keeps no row for a site the phone no longer holds', async () => {
    await pull([monthRow({ site_id: SITE_2 })]);
    expect(await db.all('select * from mirror_month_entries')).toEqual([]);
  });

  it('is emptied on sign-out', async () => {
    await pull([monthRow()]);
    await clearMirrors(db);
    expect(await db.all('select * from mirror_month_entries')).toEqual([]);
  });

  it('refuses a month or date that is not well formed', async () => {
    await pull([monthRow()]);
    await expect(readMonthEntries(db, USER_A, SITE_1, WORKER_1, 'November')).rejects.toThrow('month must be YYYY-MM');
    await expect(readDayStatus(db, USER_A, SITE_1, 'today')).rejects.toThrow('date must be YYYY-MM-DD');
  });
});

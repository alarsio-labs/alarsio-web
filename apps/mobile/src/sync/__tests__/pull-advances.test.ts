import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { readSiteAdvances, runPull, type MirrorKind, type MirrorSource } from '../pull';
import { SyncTransportError } from '../sender';

// Issue #239, ADR-054: the advances mirror, read from the worker_advance_lines view under RLS.

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const T0 = new Date('2026-11-19T08:00:00.000Z');
const ID = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = ID('51000000', 1);
const SITE_2 = ID('51000000', 2);
const WORKER_1 = ID('77000000', 1);

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
const advanceRow = (over: Record<string, unknown> = {}) => ({
  id: ID('ad000000', (n += 1)),
  site_id: SITE_1,
  worker_id: WORKER_1,
  paid_on: '2026-11-10',
  amount_paise: 50000,
  note: null,
  reverses_id: null,
  ...over,
});

function fakeSource(data: Partial<Record<MirrorKind, Rows>>, user: string | null = USER_A) {
  const state = { user, data, failAdvances: false };
  const source: MirrorSource = {
    currentUserId: async () => state.user,
    fetchPage: async (kind, _userId, after, limit) => {
      if (kind === 'advances' && state.failAdvances) throw new SyncTransportError('network');
      const key = kind === 'sites' || kind === 'advances' ? 'id' : 'x';
      return [...(state.data[kind] ?? [])]
        .sort((a, b) => String(a[key]).localeCompare(String(b[key])))
        .filter((r) => after === null || String(r[key]) > after)
        .slice(0, limit);
    },
  };
  return { source, state };
}

describe('advances mirror (#239, ADR-054)', () => {
  let db: DeviceDb;
  const pull = async (rows: Rows, user: string | null = USER_A) =>
    runPull(db, fakeSource({ sites: [site(SITE_1)], advances: rows }, user).source, { now: () => T0 });

  beforeEach(async () => {
    n = 0;
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it('shows nothing before a pull, or from another user\'s mirror', async () => {
    expect(await readSiteAdvances(db, USER_A, SITE_1)).toEqual([]);
    await pull([advanceRow()]);
    expect(await readSiteAdvances(db, USER_B, SITE_1)).toEqual([]);
  });

  it('returns the advances of a site, newest day first, with a cancellation pointing at its advance', async () => {
    const first = advanceRow({ paid_on: '2026-11-02', note: 'Rent' });
    const second = advanceRow({ paid_on: '2026-11-09' });
    const cancel = advanceRow({ paid_on: '2026-11-09', reverses_id: first.id });
    await pull([first, second, cancel]);

    const rows = await readSiteAdvances(db, USER_A, SITE_1);

    expect(rows.map((r) => [r.id, r.paidOn, r.reversesId])).toEqual([
      [second.id, '2026-11-09', null],
      [cancel.id, '2026-11-09', first.id],
      [first.id, '2026-11-02', null],
    ]);
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ amountPaise: 50000, note: 'Rent', workerId: WORKER_1 });
  });

  it('drops advances of a site the phone does not hold', async () => {
    await pull([advanceRow(), advanceRow({ site_id: SITE_2 })]);
    expect(await readSiteAdvances(db, USER_A, SITE_2)).toEqual([]);
    expect(await readSiteAdvances(db, USER_A, SITE_1)).toHaveLength(1);
  });

  it('holds more rows than one insert chunk', async () => {
    await pull(Array.from({ length: 250 }, () => advanceRow()));
    expect(await readSiteAdvances(db, USER_A, SITE_1)).toHaveLength(250);
  });

  it('keeps the old rows when the advances fetch fails for the same user', async () => {
    await pull([advanceRow()]);
    const { source, state } = fakeSource({ sites: [site(SITE_1)] });
    state.failAdvances = true;

    const result = await runPull(db, source, { now: () => T0 });

    expect(result.kind).toBe('done');
    expect(await readSiteAdvances(db, USER_A, SITE_1)).toHaveLength(1);
  });

  it('drops the old rows when the advances fetch fails for another user', async () => {
    await pull([advanceRow()]);
    const { source, state } = fakeSource({ sites: [site(SITE_1)] }, USER_B);
    state.failAdvances = true;

    await runPull(db, source, { now: () => T0 });

    expect(await readSiteAdvances(db, USER_A, SITE_1)).toEqual([]);
    expect(await readSiteAdvances(db, USER_B, SITE_1)).toEqual([]);
  });

  it('keeps the old rows, and does not fail the pull, when a row is bad', async () => {
    await pull([advanceRow()]);

    const result = await pull([advanceRow({ amount_paise: 0 })]);

    expect(result.kind).toBe('done');
    expect(await readSiteAdvances(db, USER_A, SITE_1)).toHaveLength(1);
  });

  it('device migration 12 adds the table to a phone on version 11', async () => {
    const old = await openTestDeviceDb();
    await prepareDeviceDb(old, deviceMigrations.slice(0, 11));
    await prepareDeviceDb(old, deviceMigrations);
    expect(await old.all('select * from mirror_advances')).toEqual([]);
  });
});

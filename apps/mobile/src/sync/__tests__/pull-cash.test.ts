import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { readSiteCashEntries, runPull, type MirrorKind, type MirrorSource } from '../pull';
import { SyncTransportError } from '../sender';

// Issue #258, ADR-058: the cash book mirror, read from cash_entries under RLS.

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const T0 = new Date('2026-11-19T08:00:00.000Z');
const ID = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = ID('51000000', 1);
const SITE_2 = ID('51000000', 2);

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
const cashRow = (over: Record<string, unknown> = {}) => ({
  id: ID('ca000000', (n += 1)),
  site_id: SITE_1,
  entry_date: '2026-11-10',
  category: 'wages',
  amount_paise: 50000,
  note: null,
  reverses_id: null,
  ...over,
});

function fakeSource(data: Partial<Record<MirrorKind, Rows>>, user: string | null = USER_A) {
  const state = { user, data, failCash: false };
  const source: MirrorSource = {
    currentUserId: async () => state.user,
    fetchPage: async (kind, _userId, after, limit) => {
      if (kind === 'cash_entries' && state.failCash) throw new SyncTransportError('network');
      const key = kind === 'sites' || kind === 'cash_entries' ? 'id' : 'x';
      return [...(state.data[kind] ?? [])]
        .sort((a, b) => String(a[key]).localeCompare(String(b[key])))
        .filter((r) => after === null || String(r[key]) > after)
        .slice(0, limit);
    },
  };
  return { source, state };
}

describe('cash book mirror (#258, ADR-058)', () => {
  let db: DeviceDb;
  const pull = async (rows: Rows, user: string | null = USER_A) =>
    runPull(db, fakeSource({ sites: [site(SITE_1)], cash_entries: rows }, user).source, { now: () => T0 });

  beforeEach(async () => {
    n = 0;
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it("shows nothing before a pull, or from another user's mirror", async () => {
    expect(await readSiteCashEntries(db, USER_A, SITE_1)).toEqual([]);
    await pull([cashRow()]);
    expect(await readSiteCashEntries(db, USER_B, SITE_1)).toEqual([]);
  });

  it('returns the entries of a site, newest day first, with a cancellation pointing at its entry', async () => {
    const first = cashRow({ entry_date: '2026-11-02', category: 'received', note: 'From owner' });
    const second = cashRow({ entry_date: '2026-11-09' });
    const cancel = cashRow({ entry_date: '2026-11-09', reverses_id: first.id });
    await pull([first, second, cancel]);

    const rows = await readSiteCashEntries(db, USER_A, SITE_1);

    expect(rows.map((r) => [r.id, r.entryDate, r.reversesId])).toEqual([
      [second.id, '2026-11-09', null],
      [cancel.id, '2026-11-09', first.id],
      [first.id, '2026-11-02', null],
    ]);
    expect(rows.find((r) => r.id === first.id)).toMatchObject({ amountPaise: 50000, note: 'From owner', category: 'received' });
  });

  it('drops entries of a site the phone does not hold', async () => {
    await pull([cashRow(), cashRow({ site_id: SITE_2 })]);
    expect(await readSiteCashEntries(db, USER_A, SITE_2)).toEqual([]);
    expect(await readSiteCashEntries(db, USER_A, SITE_1)).toHaveLength(1);
  });

  it('holds more rows than one insert chunk', async () => {
    await pull(Array.from({ length: 250 }, () => cashRow()));
    expect(await readSiteCashEntries(db, USER_A, SITE_1)).toHaveLength(250);
  });

  it('keeps the old rows when the fetch fails for the same user', async () => {
    await pull([cashRow()]);
    const { source, state } = fakeSource({ sites: [site(SITE_1)] });
    state.failCash = true;

    const result = await runPull(db, source, { now: () => T0 });

    expect(result.kind).toBe('done');
    expect(await readSiteCashEntries(db, USER_A, SITE_1)).toHaveLength(1);
  });

  it('drops the old rows when the fetch fails for another user', async () => {
    await pull([cashRow()]);
    const { source, state } = fakeSource({ sites: [site(SITE_1)] }, USER_B);
    state.failCash = true;

    await runPull(db, source, { now: () => T0 });

    expect(await readSiteCashEntries(db, USER_A, SITE_1)).toEqual([]);
    expect(await readSiteCashEntries(db, USER_B, SITE_1)).toEqual([]);
  });

  it.each([
    ['a zero amount', { amount_paise: 0 }],
    ['an unknown category', { category: 'gift' }],
  ])('keeps the old rows, and does not fail the pull, for %s', async (_name, bad) => {
    await pull([cashRow()]);

    const result = await pull([cashRow(bad)]);

    expect(result.kind).toBe('done');
    expect(await readSiteCashEntries(db, USER_A, SITE_1)).toHaveLength(1);
  });
});

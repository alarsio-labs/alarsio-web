import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { enqueue, listRecords } from '../../sync/outbox';
import { runPull, type MirrorSource } from '../../sync/pull';
import { loadSiteCash, reverseEntry, saveEntry } from '../cash-store';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `eeeeeeee-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const SITE_2 = '51000000-0000-4000-8000-000000000002';
const RAM = '77000000-0000-4000-8000-000000000001';
const PULLED = new Date('2026-11-20T08:00:00.000Z');
const NOW = new Date('2026-11-20T09:00:00.000Z');
const SERVER_CASH = 'ca000000-0000-4000-8000-000000000001';
const SERVER_ADV = 'ad000000-0000-4000-8000-000000000001';

const site = (id: string) => ({
  id, org_id: ORG, name: 'Kothrud', address: 'Pune', status: 'active', latitude: 18.5, longitude: 73.8, geofence_radius_m: 200,
});

const cashRow = (over: Record<string, unknown> = {}) => ({
  id: SERVER_CASH, site_id: SITE, entry_date: '2026-11-15', category: 'received', amount_paise: 100000, note: null, reverses_id: null, ...over,
});
const advanceRow = (over: Record<string, unknown> = {}) => ({
  id: SERVER_ADV, site_id: SITE, worker_id: RAM, paid_on: '2026-11-12', amount_paise: 20000, note: null, reverses_id: null, ...over,
});

/** A server where USER_A holds two sites, one worker, and whatever cash and advance rows a test gives. */
function mirrorSource(user = USER_A, cash: Record<string, unknown>[] = [], advances: Record<string, unknown>[] = []): MirrorSource {
  const data = {
    sites: [site(SITE), site(SITE_2)],
    materials: [],
    roster: [
      {
        assignment_id: 'a5000000-0000-4000-8000-000000000001', worker_id: RAM, site_id: SITE, worker_code: 'W-1',
        name: 'Ram', trade: 'mason', assigned_at: '2026-10-01T04:00:00+00:00', unassigned_at: null,
      },
    ],
    approved_days: [],
    month_entries: [],
    report_status: [],
    advances,
    cash_entries: cash,
  };
  return { currentUserId: async () => user, fetchPage: async (kind, _u, after) => (after === null ? data[kind] : []) };
}

describe('cash store', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const pull = (cash: Record<string, unknown>[] = [], advances: Record<string, unknown>[] = []) =>
    runPull(db, mirrorSource(USER_A, cash, advances), { now: () => PULLED });
  const draft = (over: Partial<Parameters<typeof saveEntry>[3]> = {}) => ({ category: 'wages', amount: '300', note: '', ...over });
  const setStatus = (recordId: string, status: string) => db.run(`update outbox set status = ? where record_id = ?`, [status, recordId]);

  describe('saveEntry', () => {
    it('queues one cash_entries record under the signed-in user, with exactly the handler payload', async () => {
      const recordId = await saveEntry(db, USER_A, SITE, draft({ amount: '12.5', note: ' tea ', entryDate: '2026-11-19' }), NOW);

      const rows = await listRecords(db, USER_A, 'cash_entries');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ recordId, status: 'pending' });
      expect(rows[0]!.payload).toEqual({
        site_id: SITE,
        entry_date: '2026-11-19',
        category: 'wages',
        amount_paise: 1250,
        note: 'tea',
        reverses_id: null,
      });
    });

    it('takes the day in Asia/Kolkata, not in UTC, when none is given', async () => {
      await saveEntry(db, USER_A, SITE, draft(), new Date('2026-11-20T20:00:00.000Z'));
      const [row] = await listRecords(db, USER_A, 'cash_entries');
      expect(row!.payload.entry_date).toBe('2026-11-21');
    });

    it('refuses what the rules refuse and writes nothing', async () => {
      await expect(saveEntry(db, USER_A, SITE, draft({ amount: '0' }), NOW)).rejects.toMatchObject({ code: 'amount_zero' });
      await expect(saveEntry(db, USER_A, SITE, draft({ category: 'gift' }), NOW)).rejects.toMatchObject({ code: 'category_invalid' });
      await expect(saveEntry(db, USER_A, SITE, draft({ entryDate: '2026-11-25' }), NOW)).rejects.toMatchObject({ code: 'date_future' });
      expect(await listRecords(db, USER_A, 'cash_entries')).toEqual([]);
    });
  });

  describe('loadSiteCash', () => {
    it('is empty with nothing saved, and for another user', async () => {
      await saveEntry(db, USER_A, SITE, draft(), NOW);
      expect(await loadSiteCash(db, USER_B, SITE, NOW)).toEqual({
        lines: [],
        balance: { inPaise: 0, outPaise: 0, advancesPaise: 0, boxPaise: 0 },
        waiting: 0,
      });
    });

    it('joins saved entries, mirrored entries and advances, newest day first, with the box and the waiting count', async () => {
      await pull([cashRow()], [advanceRow()]);
      const mine = await saveEntry(db, USER_A, SITE, draft({ amount: '300', entryDate: '2026-11-18' }), NOW);

      const { lines, balance, waiting } = await loadSiteCash(db, USER_A, SITE, NOW);

      expect(lines.map((l) => [l.recordId, l.source, l.entryDate, l.status])).toEqual([
        [mine, 'cash', '2026-11-18', 'pending'],
        [SERVER_CASH, 'cash', '2026-11-15', 'synced'],
        [SERVER_ADV, 'advance', '2026-11-12', 'synced'],
      ]);
      expect(lines.find((l) => l.source === 'advance')).toMatchObject({ workerName: 'Ram', category: null, canCancel: false });
      // In ₹1000, out ₹300, advance ₹200.
      expect(balance).toEqual({ inPaise: 100000, outPaise: 30000, advancesPaise: 20000, boxPaise: 50000 });
      expect(waiting).toBe(1);
    });

    it('shows an entry once when the outbox and the mirror both hold it', async () => {
      const id = await saveEntry(db, USER_A, SITE, draft({ entryDate: '2026-11-18' }), NOW);
      await setStatus(id, 'synced');
      await pull([cashRow({ id, category: 'wages', entry_date: '2026-11-18', amount_paise: 30000 })]);

      expect((await loadSiteCash(db, USER_A, SITE, NOW)).lines.map((l) => l.recordId)).toEqual([id]);
    });

    it('leaves out the other site, a row that is not an entry, and the cancellation record of an advance', async () => {
      await pull([cashRow({ site_id: SITE_2 })], [advanceRow(), advanceRow({ id: 'ad000000-0000-4000-8000-000000000002', reverses_id: SERVER_ADV })]);
      await enqueue(db, { entity: 'cash_entries', recordId: 'bbbbbbbb-0000-4000-8000-000000000001', authorId: USER_A, payload: { site_id: SITE } }, NOW);

      const { lines, balance } = await loadSiteCash(db, USER_A, SITE, NOW);

      expect(lines.map((l) => [l.recordId, l.cancelled])).toEqual([[SERVER_ADV, true]]);
      expect(balance.advancesPaise).toBe(0);
    });

    it('does not count a record the server refused, nor wait for it', async () => {
      const id = await saveEntry(db, USER_A, SITE, draft(), NOW);
      await setStatus(id, 'rejected');

      const { balance, waiting } = await loadSiteCash(db, USER_A, SITE, NOW);

      expect(balance.outPaise).toBe(0);
      expect(waiting).toBe(0);
    });

    it("counts only this month's lines in the box", async () => {
      await pull([cashRow({ entry_date: '2026-10-30' })]);
      expect((await loadSiteCash(db, USER_A, SITE, NOW)).balance.inPaise).toBe(0);
    });

    it('marks an entry cancelled when its cancellation is held, and nets the box', async () => {
      await pull([cashRow(), cashRow({ id: 'ca000000-0000-4000-8000-000000000002', reverses_id: SERVER_CASH })]);

      const { lines, balance } = await loadSiteCash(db, USER_A, SITE, NOW);

      expect(lines.find((l) => l.recordId === SERVER_CASH)).toMatchObject({ cancelled: true, canCancel: false });
      expect(balance.inPaise).toBe(0);
    });
  });

  describe('reverseEntry', () => {
    it('queues a cancellation that repeats the site, day, category and whole amount', async () => {
      await pull([cashRow({ category: 'transport', amount_paise: 45050, entry_date: '2026-11-14' })]);

      const reversal = await reverseEntry(db, USER_A, SITE, SERVER_CASH, NOW);

      const rows = await listRecords(db, USER_A, 'cash_entries');
      expect(rows.find((r) => r.recordId === reversal)!.payload).toEqual({
        site_id: SITE,
        entry_date: '2026-11-14',
        category: 'transport',
        amount_paise: 45050,
        note: null,
        reverses_id: SERVER_CASH,
      });
    });

    it('refuses an entry the server does not hold yet, an unknown one, an advance and a cancellation', async () => {
      await pull([cashRow({ id: 'ca000000-0000-4000-8000-000000000002', reverses_id: SERVER_CASH })], [advanceRow()]);
      const unsynced = await saveEntry(db, USER_A, SITE, draft(), NOW);
      const ids = [unsynced, 'ca000000-0000-4000-8000-0000000000ff', SERVER_ADV, 'ca000000-0000-4000-8000-000000000002'];
      for (const id of ids) {
        await expect(reverseEntry(db, USER_A, SITE, id, NOW)).rejects.toMatchObject({ code: 'entry_not_found' });
      }
    });

    it('refuses to cancel twice, but allows it again once the first cancellation was rejected', async () => {
      await pull([cashRow()]);
      const first = await reverseEntry(db, USER_A, SITE, SERVER_CASH, NOW);

      await expect(reverseEntry(db, USER_A, SITE, SERVER_CASH, NOW)).rejects.toMatchObject({ code: 'already_cancelled' });

      await setStatus(first, 'rejected');
      await expect(reverseEntry(db, USER_A, SITE, SERVER_CASH, NOW)).resolves.toEqual(expect.any(String));
    });

    it("cannot cancel another user's entry", async () => {
      await pull([cashRow()]);
      await expect(reverseEntry(db, USER_B, SITE, SERVER_CASH, NOW)).rejects.toMatchObject({ code: 'entry_not_found' });
    });
  });
});

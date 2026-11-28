import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { enqueue, listRecords } from '../../sync/outbox';
import { runPull, type MirrorSource } from '../../sync/pull';
import { loadSiteAdvances, reverseAdvance, saveAdvance } from '../advance-store';

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
const SITA = '77000000-0000-4000-8000-000000000002';
const LATE = '77000000-0000-4000-8000-000000000003';
const GONE = '77000000-0000-4000-8000-000000000004';
const ELSEWHERE = '77000000-0000-4000-8000-000000000005';
const PULLED = new Date('2026-10-20T08:00:00.000Z');
const NOW = new Date('2026-10-20T09:00:00.000Z');

const site = (id: string, name: string) => ({
  id, org_id: ORG, name, address: 'Pune', status: 'active', latitude: 18.5, longitude: 73.8, geofence_radius_m: 200,
});
const rostered = (n: number, workerId: string, name: string, siteId = SITE, assignedAt = '2026-10-01T04:00:00+00:00', unassignedAt: string | null = null) => ({
  assignment_id: `a5000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  worker_id: workerId,
  site_id: siteId,
  worker_code: `W-${n}`,
  name,
  trade: 'mason',
  assigned_at: assignedAt,
  unassigned_at: unassignedAt,
});

/** A server where USER_A holds two sites and a roster with a late joiner, a leaver and a worker on the other site. */
function mirrorSource(user = USER_A, advances: Record<string, unknown>[] = []): MirrorSource {
  const data = {
    advances,
    sites: [site(SITE, 'Kothrud'), site(SITE_2, 'Baner')],
    materials: [],
    roster: [
      rostered(1, RAM, 'Ram'),
      rostered(2, SITA, 'Sita'),
      rostered(3, LATE, 'Late', SITE, '2026-10-10T04:00:00+00:00'),
      rostered(4, GONE, 'Gone', SITE, '2026-10-01T04:00:00+00:00', '2026-10-05T04:00:00+00:00'),
      rostered(5, ELSEWHERE, 'Elsewhere', SITE_2),
    ],
    approved_days: [],
    month_entries: [],
    report_status: [],
    cash_entries: [],
  };
  return { currentUserId: async () => user, fetchPage: async (kind, _u, after) => (after === null ? data[kind] : []) };
}

describe('advance store', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await runPull(db, mirrorSource(), { now: () => PULLED });
  });

  const draft = (over: Partial<Parameters<typeof saveAdvance>[3]> = {}) => ({
    workerId: RAM,
    amount: '500',
    note: '',
    ...over,
  });
  const markSynced = (recordId: string) => db.run(`update outbox set status = 'synced' where record_id = ?`, [recordId]);

  describe('saveAdvance', () => {
    it('queues one worker_advances record under the signed-in user, with exactly the handler payload', async () => {
      const recordId = await saveAdvance(db, USER_A, SITE, draft({ amount: '500.50', note: ' for rent ', paidOn: '2026-10-20' }), NOW);

      const rows = await listRecords(db, USER_A, 'worker_advances');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ recordId, status: 'pending' });
      expect(rows[0]!.payload).toEqual({
        site_id: SITE,
        worker_id: RAM,
        paid_on: '2026-10-20',
        amount_paise: 50050,
        note: 'for rent',
        reverses_id: null,
      });
    });

    it("is the signed-in user's record only", async () => {
      await saveAdvance(db, USER_A, SITE, draft(), NOW);
      expect(await listRecords(db, USER_B, 'worker_advances')).toEqual([]);
      expect(await loadSiteAdvances(db, USER_B, SITE)).toEqual([]);
    });

    it('takes the day in Asia/Kolkata, not in UTC, when none is given', async () => {
      // 20:00 UTC on the 20th is 01:30 IST on the 21st.
      await saveAdvance(db, USER_A, SITE, draft(), new Date('2026-10-20T20:00:00.000Z'));
      const [row] = await listRecords(db, USER_A, 'worker_advances');
      expect(row!.payload.paid_on).toBe('2026-10-21');
    });

    it('refuses a worker who was not on this roster that day, as the server does', async () => {
      const bad: [string, string][] = [
        [ELSEWHERE, '2026-10-20'], // on another site
        [LATE, '2026-10-09'], // joined the next day
        [GONE, '2026-10-06'], // left the day before
        ['77000000-0000-4000-8000-0000000000ff', '2026-10-20'], // unknown
      ];
      for (const [workerId, paidOn] of bad) {
        await expect(saveAdvance(db, USER_A, SITE, draft({ workerId, paidOn }), NOW)).rejects.toMatchObject({ code: 'worker_not_found' });
      }
      await expect(saveAdvance(db, USER_A, SITE, draft({ workerId: LATE, paidOn: '2026-10-10' }), NOW)).resolves.toEqual(expect.any(String));
      await expect(saveAdvance(db, USER_A, SITE, draft({ workerId: GONE, paidOn: '2026-10-05' }), NOW)).resolves.toEqual(expect.any(String));
    });

    it("refuses another user's roster: a phone mirrored for someone else holds nothing for this user", async () => {
      await expect(saveAdvance(db, USER_B, SITE, draft(), NOW)).rejects.toMatchObject({ code: 'worker_not_found' });
    });

    it('refuses what the rules refuse and writes nothing', async () => {
      const bad: [Partial<Parameters<typeof saveAdvance>[3]>, string][] = [
        [{ amount: '' }, 'amount_required'],
        [{ amount: '0' }, 'amount_zero'],
        [{ amount: '1.234' }, 'amount_invalid'],
        [{ amount: '1000000.01' }, 'amount_too_large'],
        [{ paidOn: '2026-10-25' }, 'date_future'],
        [{ paidOn: 'soon' }, 'date_invalid'],
        [{ note: 'x'.repeat(501) }, 'note_too_long'],
      ];
      for (const [over, code] of bad) {
        await expect(saveAdvance(db, USER_A, SITE, draft(over), NOW)).rejects.toMatchObject({ code });
      }
      expect(await listRecords(db, USER_A, 'worker_advances')).toEqual([]);
    });
  });

  describe('loadSiteAdvances', () => {
    it("lists this user's advances at the site, newest first, with the worker's name and status", async () => {
      const first = await saveAdvance(db, USER_A, SITE, draft({ amount: '100' }), NOW);
      const second = await saveAdvance(db, USER_A, SITE, draft({ workerId: SITA, amount: '200' }), NOW);
      await saveAdvance(db, USER_A, SITE_2, draft({ workerId: ELSEWHERE }), NOW);
      await markSynced(first);

      const list = await loadSiteAdvances(db, USER_A, SITE);

      expect(list.map((a) => [a.recordId, a.workerName, a.amountPaise, a.status, a.canCancel])).toEqual([
        [second, 'Sita', 20000, 'pending', false],
        [first, 'Ram', 10000, 'synced', true],
      ]);
    });

    it('skips a row that is not an advance, and keeps the rest', async () => {
      await enqueue(db, { entity: 'worker_advances', recordId: 'bbbbbbbb-0000-4000-8000-000000000001', authorId: USER_A, payload: { site_id: SITE } }, NOW);
      const id = await saveAdvance(db, USER_A, SITE, draft(), NOW);
      expect((await loadSiteAdvances(db, USER_A, SITE)).map((a) => a.recordId)).toEqual([id]);
    });
  });

  describe('advances the server holds (mirror)', () => {
    const SERVER_ADV = 'ad000000-0000-4000-8000-000000000001';
    const serverRow = (over: Record<string, unknown> = {}) => ({
      id: SERVER_ADV, site_id: SITE, worker_id: SITA, paid_on: '2026-10-15', amount_paise: 30000, note: 'web', reverses_id: null, ...over,
    });
    const pullAdvances = (rows: Record<string, unknown>[]) => runPull(db, mirrorSource(USER_A, rows), { now: () => PULLED });

    it('lists an advance recorded elsewhere with the worker name, newest day first, and it can be cancelled', async () => {
      await pullAdvances([serverRow()]);
      const mine = await saveAdvance(db, USER_A, SITE, draft({ amount: '100', paidOn: '2026-10-20' }), NOW);

      const list = await loadSiteAdvances(db, USER_A, SITE);

      expect(list.map((a) => [a.recordId, a.workerName, a.status, a.canCancel])).toEqual([
        [mine, 'Ram', 'pending', false],
        [SERVER_ADV, 'Sita', 'synced', true],
      ]);
      const reversal = await reverseAdvance(db, USER_A, SITE, SERVER_ADV, NOW);
      const rows = await listRecords(db, USER_A, 'worker_advances');
      expect(rows.find((r) => r.recordId === reversal)!.payload).toMatchObject({
        worker_id: SITA, paid_on: '2026-10-15', amount_paise: 30000, reverses_id: SERVER_ADV,
      });
    });

    it('shows an advance once when the outbox and the mirror both hold it', async () => {
      const id = await saveAdvance(db, USER_A, SITE, draft({ paidOn: '2026-10-18' }), NOW);
      await markSynced(id);
      await pullAdvances([serverRow({ id, worker_id: RAM, paid_on: '2026-10-18', amount_paise: 50000, note: null })]);

      expect((await loadSiteAdvances(db, USER_A, SITE)).map((a) => a.recordId)).toEqual([id]);
    });

    it('marks a mirrored advance cancelled when the mirror holds its cancellation', async () => {
      await pullAdvances([
        serverRow(),
        serverRow({ id: 'ad000000-0000-4000-8000-000000000002', note: null, reverses_id: SERVER_ADV }),
      ]);

      const list = await loadSiteAdvances(db, USER_A, SITE);

      expect(list.find((a) => a.recordId === SERVER_ADV)).toMatchObject({ cancelled: true, canCancel: false });
    });

    it("shows another user's mirror nothing", async () => {
      await pullAdvances([serverRow()]);
      expect(await loadSiteAdvances(db, USER_B, SITE)).toEqual([]);
    });
  });

  describe('reverseAdvance', () => {
    it('queues a cancellation with the same worker, site, day and amount, and no note', async () => {
      const id = await saveAdvance(db, USER_A, SITE, draft({ amount: '750', note: 'rent', paidOn: '2026-10-18' }), NOW);
      await markSynced(id);

      const reversalId = await reverseAdvance(db, USER_A, SITE, id, NOW);

      const rows = await listRecords(db, USER_A, 'worker_advances');
      expect(rows.find((r) => r.recordId === reversalId)!.payload).toEqual({
        site_id: SITE,
        worker_id: RAM,
        paid_on: '2026-10-18',
        amount_paise: 75000,
        note: null,
        reverses_id: id,
      });
      const list = await loadSiteAdvances(db, USER_A, SITE);
      expect(list.find((a) => a.recordId === id)).toMatchObject({ cancelled: true, canCancel: false });
      expect(list.find((a) => a.recordId === reversalId)).toMatchObject({ canCancel: false });
    });

    it('refuses an advance the server may not hold yet, an unknown one, a cancellation and another user\'s', async () => {
      const pending = await saveAdvance(db, USER_A, SITE, draft(), NOW);
      await expect(reverseAdvance(db, USER_A, SITE, pending, NOW)).rejects.toMatchObject({ code: 'advance_not_found' });
      await expect(reverseAdvance(db, USER_A, SITE, 'bbbbbbbb-0000-4000-8000-0000000000ff', NOW)).rejects.toMatchObject({ code: 'advance_not_found' });

      await markSynced(pending);
      await expect(reverseAdvance(db, USER_B, SITE, pending, NOW)).rejects.toMatchObject({ code: 'advance_not_found' });
      const reversal = await reverseAdvance(db, USER_A, SITE, pending, NOW);
      await markSynced(reversal);
      await expect(reverseAdvance(db, USER_A, SITE, reversal, NOW)).rejects.toMatchObject({ code: 'advance_not_found' });
    });

    it('cancels once, but again after the server refused the cancellation', async () => {
      const id = await saveAdvance(db, USER_A, SITE, draft(), NOW);
      await markSynced(id);
      const reversal = await reverseAdvance(db, USER_A, SITE, id, NOW);

      await expect(reverseAdvance(db, USER_A, SITE, id, NOW)).rejects.toMatchObject({ code: 'already_cancelled' });

      await db.run(`update outbox set status = 'rejected', reason = 'invalid_input' where record_id = ?`, [reversal]);
      await expect(reverseAdvance(db, USER_A, SITE, id, NOW)).resolves.toEqual(expect.any(String));
    });
  });
});

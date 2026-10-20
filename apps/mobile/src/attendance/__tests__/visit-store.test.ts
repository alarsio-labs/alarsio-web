import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import type { SyncResultRow } from '../../sync/entities';
import { applyVerdicts, claimBatch, getStatus } from '../../sync/outbox';
import { findOpenVisit, listVisits, resendWithReason, saveCheckIn, saveCheckOut } from '../visit-store';
import { checkInVisit, checkOutVisit, VisitError, type Placement } from '../visit';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `cccccccc-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = '51000000-0000-4000-8000-000000000001';
const SITE_2 = '51000000-0000-4000-8000-000000000002';
const HERE: Placement = { kind: 'located', lat: 18.5204, lng: 73.8567, reason: null };
const T_IN = new Date('2026-10-20T03:40:00.000Z');
const T_OUT = new Date('2026-10-20T12:00:00.000Z');
const at = (seconds: number) => new Date(T_IN.getTime() + seconds * 1000);

const verdict = (recordId: string, v: SyncResultRow['verdict'], reason: string | null = null): SyncResultRow => ({
  entity: 'site_visits',
  record_id: recordId,
  verdict: v,
  reason,
});

describe('visit store', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const checkIn = (user = USER_A, site = SITE_1, now = T_IN) =>
    saveCheckIn(db, user, checkInVisit({ id: site, orgId: ORG }, HERE, now), now);

  it('saves a check-in as one pending site_visits row, owned by its author, under a phone-made uuid', async () => {
    const recordId = await checkIn();

    expect(recordId).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await db.all<{ entity: string; record_id: string; author_id: string; status: string; payload: string }>(
      'select entity, record_id, author_id, status, payload from outbox',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'site_visits', record_id: recordId, author_id: USER_A, status: 'pending' });
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ org_id: ORG, site_id: SITE_1, check_out_at: null });
  });

  it('writes nothing for a check-in the rules refuse', async () => {
    const bad = async () => saveCheckIn(db, USER_A, checkInVisit({ id: SITE_1, orgId: null }, HERE, T_IN), T_IN);
    await expect(bad()).rejects.toBeInstanceOf(VisitError);
    expect(await db.all('select * from outbox')).toHaveLength(0);
  });

  it('finds the open visit again after the app is closed and reopened', async () => {
    const recordId = await checkIn();

    // A fresh read over the same database is what a restarted app does.
    const open = await findOpenVisit(db, USER_A, SITE_1);
    expect(open?.recordId).toBe(recordId);
    expect(open?.visit.checkIn.at).toBe(T_IN.toISOString());
    expect(open?.status).toBe('pending');
  });

  it('check-out re-saves the same record id with both legs, and the row is pending again', async () => {
    const recordId = await checkIn();
    // The check-in is on the server by now.
    await claimBatch(db, USER_A, at(1));
    await applyVerdicts(db, [verdict(recordId, 'accepted')], at(2));
    expect((await getStatus(db, 'site_visits', recordId))?.status).toBe('synced');

    const open = (await findOpenVisit(db, USER_A, SITE_1))!;
    await saveCheckOut(db, USER_A, open.recordId, checkOutVisit(open.visit, HERE, T_OUT), T_OUT);

    expect(await db.all('select record_id from outbox')).toHaveLength(1);
    const [row] = await db.all<{ status: string; payload: string }>('select status, payload from outbox');
    expect(row?.status).toBe('pending');
    expect(JSON.parse(row!.payload)).toMatchObject({
      check_in_at: T_IN.toISOString(),
      check_out_at: T_OUT.toISOString(),
    });
    expect(await findOpenVisit(db, USER_A, SITE_1)).toBeNull();
  });

  it('a visit checked in and out while offline is one row holding both legs', async () => {
    const recordId = await checkIn();
    const open = (await findOpenVisit(db, USER_A, SITE_1))!;
    await saveCheckOut(db, USER_A, recordId, checkOutVisit(open.visit, HERE, T_OUT), T_OUT);

    const rows = await db.all<{ payload: string }>('select payload from outbox');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({
      check_in_at: T_IN.toISOString(),
      check_out_at: T_OUT.toISOString(),
    });
  });

  it("never shows another user's visit, and cannot check it out", async () => {
    const recordId = await checkIn(USER_A);

    expect(await findOpenVisit(db, USER_B, SITE_1)).toBeNull();
    expect(await listVisits(db, USER_B, SITE_1)).toEqual([]);

    const a = (await findOpenVisit(db, USER_A, SITE_1))!;
    const out = checkOutVisit(a.visit, HERE, T_OUT);
    await expect(saveCheckOut(db, USER_B, recordId, out, T_OUT)).rejects.toMatchObject({ code: 'not_found' });
    const [row] = await db.all<{ author_id: string; payload: string }>('select author_id, payload from outbox');
    expect(row?.author_id).toBe(USER_A);
    expect(JSON.parse(row!.payload).check_out_at).toBeNull();
  });

  it('keeps visits of different sites apart', async () => {
    await checkIn(USER_A, SITE_1);
    expect(await findOpenVisit(db, USER_A, SITE_2)).toBeNull();
    expect((await listVisits(db, USER_A, SITE_1)).length).toBe(1);
  });

  it('lists the newest visit first and finds an open visit from an earlier day', async () => {
    const yesterday = new Date(T_IN.getTime() - 86_400_000);
    const old = await checkIn(USER_A, SITE_1, yesterday);
    const today = await checkIn(USER_A, SITE_1, T_IN);

    const list = await listVisits(db, USER_A, SITE_1);
    expect(list.map((v) => v.recordId)).toEqual([today, old]);
    // The latest open one is today's; the earlier one is still there to be closed.
    expect((await findOpenVisit(db, USER_A, SITE_1))?.recordId).toBe(today);
  });

  it('carries the verdict back: a conflict is kept with its reason for the screen', async () => {
    const recordId = await checkIn();
    await claimBatch(db, USER_A, at(1));
    await applyVerdicts(db, [verdict(recordId, 'conflict', 'checked_out')], at(2));

    const open = (await listVisits(db, USER_A, SITE_1))[0];
    expect(open).toMatchObject({ recordId, status: 'conflict', reason: 'checked_out' });
  });

  it('a refused check-out saves nothing', async () => {
    const recordId = await checkIn();
    const open = (await findOpenVisit(db, USER_A, SITE_1))!;
    const before = await db.all('select * from outbox');
    expect(() => checkOutVisit(open.visit, HERE, new Date(T_IN.getTime() - 1000))).toThrow(VisitError);
    expect(await db.all('select * from outbox')).toEqual(before);
    expect(recordId).toBe(open.recordId);
  });

  describe('resendWithReason', () => {
    it('puts a reason on a rejected check-in and re-queues the same record id', async () => {
      const recordId = await checkIn();
      await claimBatch(db, USER_A, at(1));
      await applyVerdicts(db, [verdict(recordId, 'rejected', 'invalid_input')], at(2));

      await resendWithReason(db, USER_A, recordId, 'I was at the next plot', at(3));

      const rows = await db.all<{ record_id: string; status: string; payload: string }>(
        'select record_id, status, payload from outbox',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ record_id: recordId, status: 'pending' });
      expect(JSON.parse(rows[0]!.payload).check_in_reason).toBe('I was at the next plot');
    });

    it('puts the reason on the check-out leg when there is one, and leaves the check-in untouched', async () => {
      const recordId = await checkIn();
      const open = (await findOpenVisit(db, USER_A, SITE_1))!;
      await saveCheckOut(db, USER_A, recordId, checkOutVisit(open.visit, HERE, T_OUT), T_OUT);
      await claimBatch(db, USER_A, at(10));
      await applyVerdicts(db, [verdict(recordId, 'rejected', 'invalid_input')], at(11));

      await resendWithReason(db, USER_A, recordId, 'left early for the bank', at(12));

      const [row] = await db.all<{ payload: string }>('select payload from outbox');
      const payload = JSON.parse(row!.payload);
      expect(payload.check_out_reason).toBe('left early for the bank');
      expect(payload.check_in_reason).toBeNull();
    });

    it('refuses a blank reason and does not re-queue a visit that was not refused', async () => {
      const recordId = await checkIn();
      await expect(resendWithReason(db, USER_A, recordId, '  ', at(3))).rejects.toMatchObject({ code: 'reason_required' });
      // Still pending, not rejected: there is nothing to fix.
      await expect(resendWithReason(db, USER_A, recordId, 'x', at(3))).rejects.toMatchObject({ code: 'not_refused' });
    });

    it("cannot be used on another user's visit", async () => {
      const recordId = await checkIn(USER_A);
      await claimBatch(db, USER_A, at(1));
      await applyVerdicts(db, [verdict(recordId, 'rejected', 'invalid_input')], at(2));
      await expect(resendWithReason(db, USER_B, recordId, 'mine now', at(3))).rejects.toMatchObject({ code: 'not_found' });
    });
  });
});

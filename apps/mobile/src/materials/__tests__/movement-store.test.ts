import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { applyVerdicts, claimBatch, listRecords } from '../../sync/outbox';
import { readMaterials, runPull, type MirrorSource } from '../../sync/pull';
import { MovementError } from '../movement';
import { listMovements, loadSiteMaterials, saveMovement } from '../movement-store';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `eeeeeeee-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const SITE_2 = '51000000-0000-4000-8000-000000000002';
const CEMENT = 'a1000000-0000-4000-8000-000000000001';
const SAND = 'a1000000-0000-4000-8000-000000000002';
const OTHER_SITE_STEEL = 'a1000000-0000-4000-8000-000000000003';
const PULLED = new Date('2026-10-20T08:00:00.000Z');
const BEFORE = new Date('2026-10-20T07:00:00.000Z');
const AFTER = new Date('2026-10-20T09:00:00.000Z');

const site = (id: string, name: string) => ({
  id, org_id: ORG, name, address: 'Pune', status: 'active', latitude: 18.5, longitude: 73.8, geofence_radius_m: 200,
});
const material = (id: string, siteId: string, name: string, balance: number, threshold: number | null) => ({
  material_id: id, site_id: siteId, name, unit: 'bag', low_stock_threshold: threshold, balance,
});

/** A server where USER_A holds two sites and three materials. */
function mirrorSource(user = USER_A): MirrorSource {
  const data = {
    sites: [site(SITE, 'Kothrud'), site(SITE_2, 'Baner')],
    materials: [
      material(CEMENT, SITE, 'Cement', 40, 10),
      material(SAND, SITE, 'Sand', 3, null),
      material(OTHER_SITE_STEEL, SITE_2, 'Steel', 100, null),
    ],
    roster: [],
    approved_days: [],
  };
  return {
    currentUserId: async () => user,
    fetchPage: async (kind, _u, after) => (after === null ? data[kind] : []),
  };
}

describe('movement store', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await runPull(db, mirrorSource(), { now: () => PULLED });
  });

  const receipt = (over: Partial<Parameters<typeof saveMovement>[2]> = {}) => ({
    materialId: CEMENT,
    kind: 'receipt' as const,
    quantity: '12.5',
    reason: '',
    ...over,
  });

  describe('saveMovement', () => {
    it('queues one material_transactions record under the signed-in user, with exactly the handler payload', async () => {
      const { recordId, movement } = await saveMovement(db, USER_A, receipt({ occurredOn: '2026-10-20' }), BEFORE);

      const rows = await listRecords(db, USER_A, 'material_transactions');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ recordId, status: 'pending' });
      expect(rows[0]!.payload).toEqual({ material_id: CEMENT, kind: 'receipt', quantity: 12.5, occurred_on: '2026-10-20' });
      expect(movement).toMatchObject({ materialId: CEMENT, kind: 'receipt', quantityMilli: 12500 });
    });

    it('is the signed-in user\'s record only: another user finds nothing of it', async () => {
      await saveMovement(db, USER_A, receipt(), BEFORE);
      expect(await listRecords(db, USER_B, 'material_transactions')).toEqual([]);
      expect(await listMovements(db, USER_B, [CEMENT])).toEqual([]);
    });

    it('takes the day in Asia/Kolkata, not in UTC, when none is given', async () => {
      // 20:00 UTC on the 20th is 01:30 IST on the 21st.
      await saveMovement(db, USER_A, receipt(), new Date('2026-10-20T20:00:00.000Z'));
      const [row] = await listRecords(db, USER_A, 'material_transactions');
      expect(row!.payload.occurred_on).toBe('2026-10-21');
    });

    it('stores an adjustment signed, with its reason', async () => {
      await saveMovement(db, USER_A, receipt({ kind: 'adjustment', quantity: '-2', reason: 'two bags torn' }), BEFORE);
      const [row] = await listRecords(db, USER_A, 'material_transactions');
      expect(row!.payload).toMatchObject({ kind: 'adjustment', quantity: -2, reason: 'two bags torn' });
    });

    it('refuses what the rules refuse and writes nothing', async () => {
      const bad: [Partial<Parameters<typeof saveMovement>[2]>, string][] = [
        [{ kind: 'adjustment', quantity: '-2', reason: '' }, 'reason_required'],
        [{ kind: 'usage', quantity: '-1' }, 'quantity_negative'],
        [{ quantity: '' }, 'quantity_required'],
        [{ quantity: '1,5' }, 'quantity_invalid'],
        [{ occurredOn: '2026-10-25' }, 'date_future'],
      ];
      for (const [over, code] of bad) {
        await expect(saveMovement(db, USER_A, receipt(over), BEFORE)).rejects.toMatchObject({ code });
      }
      expect(await listRecords(db, USER_A, 'material_transactions')).toEqual([]);
    });

    it('refuses a material that is not in this user\'s copy, since a supervisor cannot add one (ADR-015)', async () => {
      await expect(saveMovement(db, USER_A, receipt({ materialId: 'a1000000-0000-4000-8000-0000000000ff' }), BEFORE)).rejects.toBeInstanceOf(MovementError);
      await expect(saveMovement(db, USER_B, receipt(), BEFORE)).rejects.toMatchObject({ code: 'material_not_found' });
      expect(await listRecords(db, USER_A, 'material_transactions')).toEqual([]);
      expect(await listRecords(db, USER_B, 'material_transactions')).toEqual([]);
    });

    it('does not touch the read-only copy of the server balance', async () => {
      await saveMovement(db, USER_A, receipt({ quantity: '5' }), BEFORE);
      const cement = (await readMaterials(db, USER_A, SITE)).find((m) => m.id === CEMENT);
      expect(cement?.balanceMilli).toBe(40000);
    });

    it('keeps the record id when the same record is saved again', async () => {
      // A movement is append-only: there is no edit, only new records, each with its own id.
      const a = await saveMovement(db, USER_A, receipt({ quantity: '1' }), BEFORE);
      const b = await saveMovement(db, USER_A, receipt({ quantity: '1' }), BEFORE);
      expect(a.recordId).not.toBe(b.recordId);
      expect(await listRecords(db, USER_A, 'material_transactions')).toHaveLength(2);
    });
  });

  describe('loadSiteMaterials', () => {
    it('lists this site\'s materials with the server balance as the estimate when nothing is recorded', async () => {
      const got = await loadSiteMaterials(db, USER_A, SITE);
      expect(got.serverAsOf).toBe(PULLED.toISOString());
      expect(got.materials.map((m) => [m.name, m.serverBalanceMilli, m.estimateMilli, m.unsent, m.state])).toEqual([
        ['Cement', 40000, 40000, 0, 'ok'],
        ['Sand', 3000, 3000, 0, 'ok'],
      ]);
    });

    it('adds this user\'s unsent movements to the estimate, and counts them', async () => {
      await saveMovement(db, USER_A, receipt({ kind: 'usage', quantity: '12.5' }), BEFORE);
      await saveMovement(db, USER_A, receipt({ kind: 'receipt', quantity: '2' }), BEFORE);
      const cement = (await loadSiteMaterials(db, USER_A, SITE)).materials.find((m) => m.id === CEMENT)!;
      expect(cement).toMatchObject({ serverBalanceMilli: 40000, estimateMilli: 29500, unsent: 2 });
    });

    it('warns at or under the low-stock level and below zero, and never refuses to record', async () => {
      await saveMovement(db, USER_A, receipt({ kind: 'usage', quantity: '30' }), BEFORE);
      expect((await loadSiteMaterials(db, USER_A, SITE)).materials.find((m) => m.id === CEMENT)!.state).toBe('low');
      await saveMovement(db, USER_A, receipt({ kind: 'usage', quantity: '20' }), BEFORE);
      expect((await loadSiteMaterials(db, USER_A, SITE)).materials.find((m) => m.id === CEMENT)!.state).toBe('negative');
    });

    it('shows only the site asked for, with that site\'s movements', async () => {
      await saveMovement(db, USER_A, receipt({ materialId: OTHER_SITE_STEEL, quantity: '9' }), BEFORE);
      const here = await loadSiteMaterials(db, USER_A, SITE);
      expect(here.materials.map((m) => m.name)).toEqual(['Cement', 'Sand']);
      expect(here.recent).toEqual([]);
      const there = await loadSiteMaterials(db, USER_A, SITE_2);
      expect(there.materials[0]).toMatchObject({ name: 'Steel', estimateMilli: 109000, unsent: 1 });
    });

    it('does not add another user\'s unsent movements on the same phone', async () => {
      // User B's own record on the shared phone, saved while B was signed in.
      await db.run(
        `insert into outbox (entity, record_id, author_id, payload, status, created_at, updated_at)
         values ('material_transactions', ?, ?, ?, 'pending', 'x', ?)`,
        [
          'eeeeeeee-0000-4000-8000-0000000000bb',
          USER_B,
          JSON.stringify({ material_id: CEMENT, kind: 'usage', quantity: 5, occurred_on: '2026-10-20' }),
          BEFORE.toISOString(),
        ],
      );
      const cement = (await loadSiteMaterials(db, USER_A, SITE)).materials.find((m) => m.id === CEMENT)!;
      expect(cement).toMatchObject({ estimateMilli: 40000, unsent: 0 });
    });

    it('does not add a refused or conflicting movement, but lists it with its reason', async () => {
      const { recordId } = await saveMovement(db, USER_A, receipt({ kind: 'usage', quantity: '10' }), BEFORE);
      await claimBatch(db, USER_A, BEFORE);
      await applyVerdicts(
        db,
        [{ entity: 'material_transactions', record_id: recordId, verdict: 'rejected', reason: 'permission_denied' }],
        BEFORE,
      );
      const got = await loadSiteMaterials(db, USER_A, SITE);
      expect(got.materials.find((m) => m.id === CEMENT)).toMatchObject({ estimateMilli: 40000, unsent: 0 });
      expect(got.recent[0]).toMatchObject({ recordId, status: 'rejected', reason: 'permission_denied', materialName: 'Cement' });
    });

    it('keeps adding a movement synced after the pull, and stops once a pull is later than it (Option B)', async () => {
      const { recordId } = await saveMovement(db, USER_A, receipt({ kind: 'usage', quantity: '10' }), BEFORE);
      await claimBatch(db, USER_A, AFTER);
      await applyVerdicts(db, [{ entity: 'material_transactions', record_id: recordId, verdict: 'accepted', reason: null }], AFTER);

      // Synced at 09:00, the balance was pulled at 08:00: the server has it, the copy does not.
      expect((await loadSiteMaterials(db, USER_A, SITE)).materials.find((m) => m.id === CEMENT)).toMatchObject({
        estimateMilli: 30000,
        unsent: 0,
      });

      // A pull at 10:00 brings the server balance (now 30), which already holds it.
      const source = mirrorSource();
      const fetchPage = source.fetchPage;
      source.fetchPage = async (kind, u, after, limit) =>
        (await fetchPage(kind, u, after, limit)).map((r) =>
          kind === 'materials' && (r as { material_id: string }).material_id === CEMENT ? { ...(r as object), balance: 30 } : r,
        );
      await runPull(db, source, { now: () => new Date('2026-10-20T10:00:00.000Z') });
      expect((await loadSiteMaterials(db, USER_A, SITE)).materials.find((m) => m.id === CEMENT)).toMatchObject({
        serverBalanceMilli: 30000,
        estimateMilli: 30000,
      });
    });

    it('lists recent movements newest first, with the material\'s name and unit, at most twenty', async () => {
      for (let i = 1; i <= 25; i += 1) {
        await saveMovement(db, USER_A, receipt({ quantity: String(i) }), BEFORE);
      }
      const got = await loadSiteMaterials(db, USER_A, SITE);
      expect(got.recent).toHaveLength(20);
      expect(got.recent[0]).toMatchObject({ materialName: 'Cement', unit: 'bag' });
      expect(got.recent[0]!.movement.quantityMilli).toBe(25000);
    });

    it('shows nothing, and no server time, when the phone holds no copy for this user', async () => {
      expect(await loadSiteMaterials(db, USER_B, SITE)).toEqual({ materials: [], serverAsOf: null, recent: [] });
      expect(await loadSiteMaterials(db, '', SITE)).toEqual({ materials: [], serverAsOf: null, recent: [] });
    });

    it('skips an outbox row that is not a movement instead of failing', async () => {
      await db.run(
        `insert into outbox (entity, record_id, author_id, payload, status, created_at, updated_at)
         values ('material_transactions', ?, ?, '{"junk":true}', 'pending', 'x', ?)`,
        ['eeeeeeee-0000-4000-8000-0000000000cc', USER_A, BEFORE.toISOString()],
      );
      const got = await loadSiteMaterials(db, USER_A, SITE);
      expect(got.materials.find((m) => m.id === CEMENT)).toMatchObject({ estimateMilli: 40000, unsent: 0 });
    });
  });
});

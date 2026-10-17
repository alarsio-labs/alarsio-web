import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { readUserVersion } from '../../db/run-migrations';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import type { SyncResultRow } from '../entities';
import {
  applyVerdicts,
  backoffMs,
  claimBatch,
  countByStatus,
  enqueue,
  getStatus,
  MAX_BATCH,
  newRecordId,
  recoverInterrupted,
  releaseBatch,
  type OutboxEntry,
} from '../outbox';

// Jest hoists jest.mock above the imports.
// jest-expo stubs native modules, so expo-crypto's randomUUID returns undefined
// here. A counter stands in: this checks that newRecordId hands back a fresh
// uuid-shaped id each call. The real generator is checked on a phone.
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: () => `aaaaaaaa-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
  };
});

const T0 = new Date('2026-10-20T08:00:00.000Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n: number, payload: Record<string, unknown> = { qty: n }): OutboxEntry => ({
  entity: 'material_transactions',
  recordId: ID(n),
  payload,
});
const verdict = (n: number, v: SyncResultRow['verdict'], reason: string | null = null): SyncResultRow => ({
  entity: 'material_transactions',
  record_id: ID(n),
  verdict: v,
  reason,
});

interface Row {
  seq: number;
  record_id: string;
  payload: string;
  status: string;
  reason: string | null;
  attempts: number;
  next_attempt_at: string | null;
  dirty: number;
}

async function rows(db: DeviceDb): Promise<Row[]> {
  return db.all<Row>(
    'select seq, record_id, payload, status, reason, attempts, next_attempt_at, dirty from outbox order by seq',
  );
}

async function row(db: DeviceDb, n: number): Promise<Row | undefined> {
  return (await rows(db)).find((r) => r.record_id === ID(n));
}

describe('outbox', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  describe('migration 1', () => {
    it('creates the outbox as device version 1', async () => {
      expect(await readUserVersion(db)).toBe(1);
      expect(await rows(db)).toEqual([]);
    });

    it('refuses a bad entity, status or payload at the table, whatever the code does', async () => {
      const insert = (entity: string, payload: string, status = 'pending') =>
        db.run(
          `insert into outbox (entity, record_id, payload, status, created_at, updated_at)
           values (?, ?, ?, ?, 'x', 'x')`,
          [entity, ID(1), payload, status],
        );
      await expect(insert('punch_list', '{}')).rejects.toThrow(/CHECK/);
      await expect(insert('daily_reports', '[1]')).rejects.toThrow(/CHECK/);
      await expect(insert('daily_reports', 'not json')).rejects.toThrow(/CHECK/);
      await expect(insert('daily_reports', '{}', 'submitted')).rejects.toThrow(/CHECK/);
      expect(await rows(db)).toEqual([]);
    });
  });

  describe('enqueue', () => {
    it('queues a new record as pending, in capture order', async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, entry(2), T0);

      const all = await rows(db);
      expect(all.map((r) => [r.record_id, r.status])).toEqual([
        [ID(1), 'pending'],
        [ID(2), 'pending'],
      ]);
      expect(all[0]!.seq).toBeLessThan(all[1]!.seq);
    });

    it('keeps one row per record: a second save takes the new payload and keeps its place', async () => {
      await enqueue(db, entry(1, { qty: 1 }), T0);
      await enqueue(db, entry(2), T0);
      const seqBefore = (await row(db, 1))!.seq;

      await enqueue(db, entry(1, { qty: 5 }), at(10));

      const all = await rows(db);
      expect(all).toHaveLength(2);
      expect((await row(db, 1))!.seq).toBe(seqBefore);
      expect(JSON.parse((await row(db, 1))!.payload)).toEqual({ qty: 5 });
      expect(all.map((r) => r.record_id)).toEqual([ID(1), ID(2)]);
    });

    it('treats an upper-case id as the same record', async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, { ...entry(1), recordId: ID(1).toUpperCase() }, T0);
      expect(await rows(db)).toHaveLength(1);
    });

    it('refuses an unknown entity, a bad id or a non-object payload, and writes nothing', async () => {
      const bad: unknown[] = [
        { ...entry(1), entity: 'punch_list' },
        { ...entry(1), recordId: 'not-a-uuid' },
        { ...entry(1), payload: [1, 2] },
        { ...entry(1), payload: null },
      ];
      for (const e of bad) {
        await expect(enqueue(db, e as OutboxEntry, T0)).rejects.toThrow();
      }
      expect(await rows(db)).toEqual([]);
    });

    it('puts a rejected record back to pending when it is saved again, with retries reset', async () => {
      await enqueue(db, entry(1), T0);
      await claimBatch(db, T0);
      await applyVerdicts(db, [verdict(1, 'rejected', 'invalid_input')], T0);

      await enqueue(db, entry(1, { qty: 2 }), at(5));

      expect(await row(db, 1)).toMatchObject({ status: 'pending', reason: null, attempts: 0, dirty: 0 });
    });
  });

  describe('claimBatch', () => {
    it('claims oldest first, marks them syncing, and caps the batch at 100', async () => {
      for (let n = 1; n <= MAX_BATCH + 5; n += 1) await enqueue(db, entry(n), T0);

      const first = await claimBatch(db, T0);
      expect(first).toHaveLength(MAX_BATCH);
      expect(first[0]).toEqual({ entity: 'material_transactions', recordId: ID(1), payload: { qty: 1 } });
      expect(first[MAX_BATCH - 1]!.recordId).toBe(ID(MAX_BATCH));
      expect((await countByStatus(db)).syncing).toBe(MAX_BATCH);

      const second = await claimBatch(db, T0);
      expect(second.map((e) => e.recordId)).toEqual([ID(101), ID(102), ID(103), ID(104), ID(105)]);
    });

    it('skips syncing, synced, conflict and rejected rows, and failed rows that are not due', async () => {
      for (let n = 1; n <= 5; n += 1) await enqueue(db, entry(n), T0);
      await claimBatch(db, T0);
      await applyVerdicts(
        db,
        [
          verdict(1, 'accepted'),
          verdict(2, 'conflict', 'locked'),
          verdict(3, 'rejected', 'invalid_input'),
          verdict(4, 'retryable_error', 'busy'),
        ],
        T0,
      );
      // 5 is still syncing.

      expect(await claimBatch(db, at(1))).toEqual([]);
      const due = await claimBatch(db, at(30));
      expect(due.map((e) => e.recordId)).toEqual([ID(4)]);
    });
  });

  describe('applyVerdicts', () => {
    it('turns each verdict into its status', async () => {
      for (let n = 1; n <= 4; n += 1) await enqueue(db, entry(n), T0);
      await claimBatch(db, T0);

      await applyVerdicts(
        db,
        [
          verdict(1, 'accepted'),
          verdict(2, 'conflict', 'locked'),
          verdict(3, 'rejected', 'permission_denied'),
          verdict(4, 'retryable_error', 'missing_parent'),
        ],
        T0,
      );

      expect(await row(db, 1)).toMatchObject({ status: 'synced', reason: null, attempts: 0 });
      expect(await row(db, 2)).toMatchObject({ status: 'conflict', reason: 'locked' });
      expect(await row(db, 3)).toMatchObject({ status: 'rejected', reason: 'permission_denied' });
      expect(await row(db, 4)).toMatchObject({
        status: 'failed',
        reason: 'missing_parent',
        attempts: 1,
        next_attempt_at: at(30).toISOString(),
      });
    });

    it('only an accepted verdict makes a record synced', async () => {
      await enqueue(db, entry(1), T0);
      expect(await getStatus(db, 'material_transactions', ID(1))).toEqual({ status: 'pending', reason: null });
      await claimBatch(db, T0);
      expect((await getStatus(db, 'material_transactions', ID(1)))!.status).toBe('syncing');
      await applyVerdicts(db, [verdict(1, 'accepted')], T0);
      expect((await getStatus(db, 'material_transactions', ID(1)))!.status).toBe('synced');
    });

    it('backs off 30 s, 60 s, 120 s … and never waits more than 30 minutes', async () => {
      expect([1, 2, 3, 4].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
      expect(backoffMs(7)).toBe(30 * 60_000);
      expect(backoffMs(50)).toBe(30 * 60_000);

      await enqueue(db, entry(1), T0);
      let now = T0;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await claimBatch(db, now);
        await applyVerdicts(db, [verdict(1, 'retryable_error', 'busy')], now);
        const r = (await row(db, 1))!;
        expect(r.attempts).toBe(attempt);
        expect(r.next_attempt_at).toBe(new Date(now.getTime() + backoffMs(attempt)).toISOString());
        now = new Date(r.next_attempt_at!);
      }
    });

    it('keeps an edit made during the push: the record goes back to pending with the new payload', async () => {
      await enqueue(db, entry(1, { status: 'draft' }), T0);
      await claimBatch(db, T0);

      await enqueue(db, entry(1, { status: 'submitted' }), at(1));
      expect(await row(db, 1)).toMatchObject({ status: 'syncing', dirty: 1 });

      await applyVerdicts(db, [verdict(1, 'accepted')], at(2));

      expect(await row(db, 1)).toMatchObject({ status: 'pending', dirty: 0 });
      const next = await claimBatch(db, at(3));
      expect(next).toEqual([{ ...entry(1), payload: { status: 'submitted' } }]);
    });

    it('requeues a dirty record whatever the verdict, so the newer edit is still sent', async () => {
      await enqueue(db, entry(1), T0);
      await claimBatch(db, T0);
      await enqueue(db, entry(1, { qty: 9 }), at(1));

      await applyVerdicts(db, [verdict(1, 'rejected', 'invalid_input')], at(2));

      expect(await row(db, 1)).toMatchObject({ status: 'pending', reason: null, dirty: 0 });
    });

    it('ignores results for records that are not syncing, or that it has never seen', async () => {
      await enqueue(db, entry(1), T0);
      await applyVerdicts(db, [verdict(1, 'accepted'), verdict(99, 'accepted')], T0);

      expect(await row(db, 1)).toMatchObject({ status: 'pending' });
      expect(await rows(db)).toHaveLength(1);
    });
  });

  describe('releaseBatch', () => {
    it('fails every syncing record with a backoff when the whole push failed', async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, entry(2), T0);
      await claimBatch(db, T0);
      await enqueue(db, entry(2, { qty: 22 }), at(1)); // edited during the push

      await releaseBatch(db, 'network', at(2));

      expect(await row(db, 1)).toMatchObject({
        status: 'failed',
        reason: 'network',
        attempts: 1,
        next_attempt_at: at(32).toISOString(),
      });
      expect(await row(db, 2)).toMatchObject({ status: 'pending', dirty: 0 });
    });
  });

  describe('recoverInterrupted', () => {
    it('after the app is killed mid-push, reopening puts syncing records back to pending', async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, entry(2), T0);
      await claimBatch(db, T0);
      // The app dies here: no verdict, no release. Reopen the same database.
      await prepareDeviceDb(db, deviceMigrations);

      expect(await recoverInterrupted(db, at(60))).toBe(2);

      expect((await countByStatus(db)).pending).toBe(2);
      const again = await claimBatch(db, at(61));
      expect(again.map((e) => e.recordId)).toEqual([ID(1), ID(2)]);
    });

    it('leaves synced, failed, conflict and rejected records alone', async () => {
      for (let n = 1; n <= 4; n += 1) await enqueue(db, entry(n), T0);
      await claimBatch(db, T0);
      await applyVerdicts(
        db,
        [
          verdict(1, 'accepted'),
          verdict(2, 'retryable_error', 'busy'),
          verdict(3, 'conflict', 'locked'),
          verdict(4, 'rejected', 'invalid_input'),
        ],
        T0,
      );

      expect(await recoverInterrupted(db, at(1))).toBe(0);
      expect(await countByStatus(db)).toEqual({
        pending: 0,
        syncing: 0,
        synced: 1,
        failed: 1,
        conflict: 1,
        rejected: 1,
      });
    });
  });

  describe('newRecordId', () => {
    it('makes a fresh uuid each time', () => {
      const a = newRecordId();
      const b = newRecordId();
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(a).not.toBe(b);
    });
  });
});

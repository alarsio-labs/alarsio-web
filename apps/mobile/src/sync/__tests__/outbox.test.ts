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
  countUnsent,
  listAttention,
  enqueue,
  getStatus,
  MAX_BATCH,
  newRecordId,
  recoverInterrupted,
  releaseBatch,
  retryFailedNow,
  returnBatch,
  type NewOutboxEntry,
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

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n: number, payload: Record<string, unknown> = { qty: n }): NewOutboxEntry => ({
  entity: 'material_transactions',
  recordId: ID(n),
  authorId: USER_A,
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
    it('brings the device database to the latest version, with an empty outbox', async () => {
      expect(await readUserVersion(db)).toBe(deviceMigrations.length);
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

    it('refuses an unknown entity, a bad record or author id, or a non-object payload, and writes nothing', async () => {
      const bad: unknown[] = [
        { ...entry(1), entity: 'punch_list' },
        { ...entry(1), recordId: 'not-a-uuid' },
        { ...entry(1), payload: [1, 2] },
        { ...entry(1), payload: null },
        { ...entry(1), authorId: 'not-a-uuid' },
        { ...entry(1), authorId: undefined },
      ];
      for (const e of bad) {
        await expect(enqueue(db, e as NewOutboxEntry, T0)).rejects.toThrow();
      }
      expect(await rows(db)).toEqual([]);
    });

    it('puts a rejected record back to pending when it is saved again, with retries reset', async () => {
      await enqueue(db, entry(1), T0);
      await claimBatch(db, USER_A, T0);
      await applyVerdicts(db, [verdict(1, 'rejected', 'invalid_input')], T0);

      await enqueue(db, entry(1, { qty: 2 }), at(5));

      expect(await row(db, 1)).toMatchObject({ status: 'pending', reason: null, attempts: 0, dirty: 0 });
    });
  });

  describe('claimBatch', () => {
    it('claims oldest first, marks them syncing, and caps the batch at 100', async () => {
      for (let n = 1; n <= MAX_BATCH + 5; n += 1) await enqueue(db, entry(n), T0);

      const first = await claimBatch(db, USER_A, T0);
      expect(first).toHaveLength(MAX_BATCH);
      expect(first[0]).toEqual({ entity: 'material_transactions', recordId: ID(1), payload: { qty: 1 } });
      expect(first[MAX_BATCH - 1]!.recordId).toBe(ID(MAX_BATCH));
      expect((await countByStatus(db)).syncing).toBe(MAX_BATCH);

      const second = await claimBatch(db, USER_A, T0);
      expect(second.map((e) => e.recordId)).toEqual([ID(101), ID(102), ID(103), ID(104), ID(105)]);
    });

    it('skips syncing, synced, conflict and rejected rows, and failed rows that are not due', async () => {
      for (let n = 1; n <= 5; n += 1) await enqueue(db, entry(n), T0);
      await claimBatch(db, USER_A, T0);
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

      expect(await claimBatch(db, USER_A, at(1))).toEqual([]);
      const due = await claimBatch(db, USER_A, at(30));
      expect(due.map((e) => e.recordId)).toEqual([ID(4)]);
    });
  });

  describe('applyVerdicts', () => {
    it('turns each verdict into its status', async () => {
      for (let n = 1; n <= 4; n += 1) await enqueue(db, entry(n), T0);
      await claimBatch(db, USER_A, T0);

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
      await claimBatch(db, USER_A, T0);
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
        await claimBatch(db, USER_A, now);
        await applyVerdicts(db, [verdict(1, 'retryable_error', 'busy')], now);
        const r = (await row(db, 1))!;
        expect(r.attempts).toBe(attempt);
        expect(r.next_attempt_at).toBe(new Date(now.getTime() + backoffMs(attempt)).toISOString());
        now = new Date(r.next_attempt_at!);
      }
    });

    it('keeps an edit made during the push: the record goes back to pending with the new payload', async () => {
      await enqueue(db, entry(1, { status: 'draft' }), T0);
      await claimBatch(db, USER_A, T0);

      await enqueue(db, entry(1, { status: 'submitted' }), at(1));
      expect(await row(db, 1)).toMatchObject({ status: 'syncing', dirty: 1 });

      await applyVerdicts(db, [verdict(1, 'accepted')], at(2));

      expect(await row(db, 1)).toMatchObject({ status: 'pending', dirty: 0 });
      const next = await claimBatch(db, USER_A, at(3));
      expect(next).toEqual([
        { entity: 'material_transactions', recordId: ID(1), payload: { status: 'submitted' } },
      ]);
    });

    it('requeues a dirty record whatever the verdict, so the newer edit is still sent', async () => {
      await enqueue(db, entry(1), T0);
      await claimBatch(db, USER_A, T0);
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
    it("fails the batch's syncing records with a backoff when the whole push failed", async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, entry(2), T0);
      const batch = await claimBatch(db, USER_A, T0);
      await enqueue(db, entry(2, { qty: 22 }), at(1)); // edited during the push

      await releaseBatch(db, batch, 'network', at(2));

      expect(await row(db, 1)).toMatchObject({
        status: 'failed',
        reason: 'network',
        attempts: 1,
        next_attempt_at: at(32).toISOString(),
      });
      expect(await row(db, 2)).toMatchObject({ status: 'pending', dirty: 0 });
    });

    it("leaves another batch's syncing records alone (#56)", async () => {
      await enqueue(db, entry(1), T0);
      const mine = await claimBatch(db, USER_A, T0);
      await enqueue(db, entry(2), T0);
      await claimBatch(db, USER_A, T0); // a second run's batch, still in flight

      await releaseBatch(db, mine, 'no_result', at(1));

      expect(await row(db, 1)).toMatchObject({ status: 'failed', reason: 'no_result' });
      expect(await row(db, 2)).toMatchObject({ status: 'syncing', attempts: 0 });
    });
  });

  describe('returnBatch', () => {
    it('puts only its own syncing records back to pending, with no retry penalty', async () => {
      await enqueue(db, entry(1), T0);
      const first = await claimBatch(db, USER_A, T0);
      await applyVerdicts(db, [verdict(1, 'retryable_error', 'busy')], T0);
      const retried = await claimBatch(db, USER_A, at(31)); // record 1 again, attempts 1
      expect(retried).toEqual(first);
      await enqueue(db, entry(2), at(31));
      await claimBatch(db, USER_A, at(31)); // another run's batch

      await returnBatch(db, retried, at(32));

      expect(await row(db, 1)).toMatchObject({ status: 'pending', attempts: 1, dirty: 0 });
      expect(await row(db, 2)).toMatchObject({ status: 'syncing' });
    });
  });

  describe('recoverInterrupted', () => {
    it('after the app is killed mid-push, reopening puts syncing records back to pending', async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, entry(2), T0);
      await claimBatch(db, USER_A, T0);
      // The app dies here: no verdict, no release. Reopen the same database.
      await prepareDeviceDb(db, deviceMigrations);

      expect(await recoverInterrupted(db, at(60))).toBe(2);

      expect((await countByStatus(db)).pending).toBe(2);
      const again = await claimBatch(db, USER_A, at(61));
      expect(again.map((e) => e.recordId)).toEqual([ID(1), ID(2)]);
    });

    it('leaves synced, failed, conflict and rejected records alone', async () => {
      for (let n = 1; n <= 4; n += 1) await enqueue(db, entry(n), T0);
      await claimBatch(db, USER_A, T0);
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

  describe('authors on a shared phone (#54)', () => {
    const asB = (n: number, payload: Record<string, unknown> = { qty: n }): NewOutboxEntry => ({
      ...entry(n, payload),
      authorId: USER_B,
    });

    it("claims only the signed-in user's rows; the other user's wait as pending", async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, asB(2), T0);
      await enqueue(db, entry(3), T0);

      const forB = await claimBatch(db, USER_B, T0);
      expect(forB.map((e) => e.recordId)).toEqual([ID(2)]);
      expect(await row(db, 1)).toMatchObject({ status: 'pending' });
      expect(await row(db, 3)).toMatchObject({ status: 'pending' });

      await applyVerdicts(db, [verdict(2, 'accepted')], T0);
      const forA = await claimBatch(db, USER_A, at(1));
      expect(forA.map((e) => e.recordId)).toEqual([ID(1), ID(3)]);
    });

    it('matches the author whatever its letter case', async () => {
      await enqueue(db, { ...entry(1), authorId: USER_A.toUpperCase() }, T0);
      expect(await countUnsent(db, USER_A.toUpperCase())).toBe(1);
      expect(await claimBatch(db, USER_A.toUpperCase(), T0)).toHaveLength(1);
    });

    it("an edit by B during A's push goes back to pending as B's", async () => {
      await enqueue(db, entry(1, { v: 'A' }), T0);
      await claimBatch(db, USER_A, T0);
      await enqueue(db, asB(1, { v: 'B' }), at(1));

      await applyVerdicts(db, [verdict(1, 'accepted')], at(2));

      expect(await row(db, 1)).toMatchObject({ status: 'pending', dirty: 0 });
      expect(await claimBatch(db, USER_A, at(3))).toEqual([]);
      expect(await claimBatch(db, USER_B, at(3))).toEqual([
        { entity: 'material_transactions', recordId: ID(1), payload: { v: 'B' } },
      ]);
    });

    it('makes the last saver the author', async () => {
      await enqueue(db, entry(1), T0);
      await enqueue(db, asB(1, { qty: 7 }), at(1));

      expect(await claimBatch(db, USER_A, at(2))).toEqual([]);
      expect(await claimBatch(db, USER_B, at(2))).toEqual([
        { entity: 'material_transactions', recordId: ID(1), payload: { qty: 7 } },
      ]);
    });

    it('never claims a row with no author, saved before migration 3', async () => {
      await db.run(
        `insert into outbox (entity, record_id, payload, created_at, updated_at)
         values ('material_transactions', ?, '{}', 'x', 'x')`,
        [ID(1)],
      );
      expect(await claimBatch(db, USER_A, T0)).toEqual([]);
      expect(await row(db, 1)).toMatchObject({ status: 'pending' });
    });

    it('refuses an author id of the wrong length at the table', async () => {
      await expect(
        db.run(
          `insert into outbox (entity, record_id, author_id, payload, created_at, updated_at)
           values ('material_transactions', ?, 'short', '{}', 'x', 'x')`,
          [ID(1)],
        ),
      ).rejects.toThrow(/CHECK/);
    });

    it("counts a user's unsent rows: everything but synced, and only theirs", async () => {
      for (let n = 1; n <= 5; n += 1) await enqueue(db, entry(n), T0);
      await enqueue(db, asB(6), T0);
      const batch = await claimBatch(db, USER_A, T0);
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
      await releaseBatch(db, batch, 'no_result', T0); // record 5 had no answer

      expect(await countUnsent(db, USER_A)).toBe(4);
      expect(await countUnsent(db, USER_B)).toBe(1);
      expect(await countByStatus(db, USER_B)).toMatchObject({ pending: 1, synced: 0 });
      expect((await countByStatus(db)).synced).toBe(1);
    });
  });

  describe('migration 3', () => {
    it('adds the author column to a phone that already has migrations 1 and 2, keeping its rows', async () => {
      const old = await openTestDeviceDb();
      await prepareDeviceDb(old, deviceMigrations.slice(0, 2));
      await old.run(
        `insert into outbox (entity, record_id, payload, created_at, updated_at)
         values ('daily_reports', ?, '{}', 'x', 'x')`,
        [ID(1)],
      );

      await prepareDeviceDb(old, deviceMigrations);

      expect(await readUserVersion(old)).toBe(deviceMigrations.length);
      expect(await old.all('select record_id, author_id from outbox')).toEqual([
        { record_id: ID(1), author_id: null },
      ]);
    });
  });

  describe('needs attention and retry now (#68)', () => {
    const asB = (n: number): NewOutboxEntry => ({ ...entry(n), authorId: USER_B });

    it("lists this user's conflict and rejected records, newest first, up to the limit", async () => {
      for (let n = 1; n <= 4; n += 1) await enqueue(db, entry(n), T0);
      await enqueue(db, asB(5), T0);
      await claimBatch(db, USER_A, T0);
      await applyVerdicts(db, [verdict(1, 'rejected', 'invalid_input'), verdict(2, 'accepted')], at(1));
      await applyVerdicts(db, [verdict(3, 'conflict', 'reviewed')], at(2));
      await applyVerdicts(db, [verdict(4, 'retryable_error', 'busy')], at(3));
      await claimBatch(db, USER_B, T0);
      await applyVerdicts(db, [verdict(5, 'rejected', 'permission_denied')], at(4));

      expect(await listAttention(db, USER_A)).toEqual([
        { entity: 'material_transactions', recordId: ID(3), status: 'conflict', reason: 'reviewed', updatedAt: at(2).toISOString() },
        { entity: 'material_transactions', recordId: ID(1), status: 'rejected', reason: 'invalid_input', updatedAt: at(1).toISOString() },
      ]);
      expect(await listAttention(db, USER_A, 1)).toHaveLength(1);
    });

    it('lists nothing and changes nothing without an author, rather than covering every user', async () => {
      await enqueue(db, entry(1), T0);
      await claimBatch(db, USER_A, T0);
      await applyVerdicts(db, [verdict(1, 'rejected', 'invalid_input')], T0);
      await enqueue(db, entry(2), T0);
      await claimBatch(db, USER_A, T0);
      await applyVerdicts(db, [verdict(2, 'retryable_error', 'busy')], T0);

      // @ts-expect-error: the author is required, so a caller cannot forget it
      expect(await listAttention(db)).toEqual([]);
      // @ts-expect-error: the author is required, so a caller cannot forget it
      expect(await retryFailedNow(db, undefined, at(1))).toBe(0);
      expect(await row(db, 2)).toMatchObject({ status: 'failed', attempts: 1 });
      expect((await row(db, 2))?.next_attempt_at).not.toBeNull();
    });

    it("makes only this user's failed records due now, and leaves the rest alone", async () => {
      for (let n = 1; n <= 3; n += 1) await enqueue(db, entry(n), T0);
      await enqueue(db, asB(4), T0);
      await claimBatch(db, USER_A, T0);
      await applyVerdicts(
        db,
        [verdict(1, 'retryable_error', 'busy'), verdict(2, 'rejected', 'invalid_input'), verdict(3, 'conflict', 'duplicate')],
        T0,
      );
      await claimBatch(db, USER_B, T0);
      await applyVerdicts(db, [verdict(4, 'retryable_error', 'busy')], T0);
      expect(await claimBatch(db, USER_A, at(1))).toEqual([]); // backing off for 30 s

      expect(await retryFailedNow(db, USER_A, at(1))).toBe(1);

      expect((await claimBatch(db, USER_A, at(1))).map((e) => e.recordId)).toEqual([ID(1)]);
      expect(await row(db, 2)).toMatchObject({ status: 'rejected' });
      expect(await row(db, 3)).toMatchObject({ status: 'conflict' });
      expect(await claimBatch(db, USER_B, at(1))).toEqual([]); // B still backing off
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

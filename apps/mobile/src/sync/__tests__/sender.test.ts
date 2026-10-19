import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { getDeviceId } from '../device-id';
import type { SyncResultRow } from '../entities';
import { claimBatch, countByStatus, enqueue, getStatus, MAX_BATCH } from '../outbox';
import {
  runSync,
  SESSION_CHANGED,
  singleFlight,
  SyncTransportError,
  type PushResponse,
  type SyncBatch,
  type SyncTransport,
} from '../sender';

// Jest hoists jest.mock above the imports. jest-expo stubs expo-crypto, so a
// counter stands in for randomUUID (used for the device id).
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: () => `dddddddd-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
  };
});

const T0 = new Date('2026-10-20T08:00:00.000Z');
const USER_A = '11111111-0000-4000-8000-00000000000a';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function queue(db: DeviceDb, count: number, from = 1): Promise<void> {
  for (let n = from; n < from + count; n += 1) {
    await enqueue(db, { entity: 'material_transactions', recordId: ID(n), authorId: USER_A, payload: { qty: n } }, T0);
  }
}

const acceptAll = (batch: SyncBatch): PushResponse => ({
  results: batch.records.map(
    (r): SyncResultRow => ({ entity: r.entity, record_id: r.record_id, verdict: 'accepted', reason: null }),
  ),
});

function fakeTransport(
  respond: (batch: SyncBatch) => PushResponse | Promise<PushResponse> = acceptAll,
  signedIn = true,
) {
  const pushes: SyncBatch[] = [];
  const transport: SyncTransport = {
    currentUserId: async () => (signedIn ? USER_A : null),
    push: async (batch) => {
      pushes.push(batch);
      return respond(batch);
    },
  };
  return { transport, pushes };
}

const status = async (db: DeviceDb, n: number) =>
  (await getStatus(db, 'material_transactions', ID(n)))?.status;

describe('runSync', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it('sends nothing and claims nothing when no one is signed in', async () => {
    await queue(db, 3);
    const { transport, pushes } = fakeTransport(acceptAll, false);

    expect(await runSync(db, transport, { now: () => T0 })).toEqual({ kind: 'signed_out' });

    expect(pushes).toHaveLength(0);
    expect((await countByStatus(db)).pending).toBe(3);
  });

  describe('on a shared phone (#54)', () => {
    const USER_B = '22222222-0000-4000-8000-00000000000b';

    /** A transport whose signed-in user the test changes by hand. */
    function switchableTransport(initial: string | null) {
      const state = { user: initial, onCheck: (_checks: number) => undefined as void };
      let checks = 0;
      const pushes: SyncBatch[] = [];
      const transport: SyncTransport = {
        currentUserId: async () => {
          const user = state.user;
          checks += 1;
          state.onCheck(checks); // runs after this check has answered
          return user;
        },
        // Like the real transport: refuses to send under anyone but the author.
        push: async (batch, userId) => {
          if (state.user !== userId) throw new SyncTransportError(SESSION_CHANGED);
          pushes.push(batch);
          return acceptAll(batch);
        },
      };
      return { transport, pushes, state };
    }

    it("sends only the signed-in user's records, and the others once their author is back", async () => {
      await queue(db, 2); // saved by A
      await enqueue(db, { entity: 'material_transactions', recordId: ID(3), authorId: USER_B, payload: {} }, T0);
      const { transport, pushes, state } = switchableTransport(USER_B);

      await runSync(db, transport, { now: () => T0 });
      expect(pushes.flatMap((b) => b.records.map((r) => r.record_id))).toEqual([ID(3)]);
      expect(await status(db, 1)).toBe('pending');
      expect(await status(db, 2)).toBe('pending');

      state.user = USER_A;
      await runSync(db, transport, { now: () => T0 });
      expect(pushes[1]?.records.map((r) => r.record_id)).toEqual([ID(1), ID(2)]);
      expect(await countByStatus(db)).toMatchObject({ synced: 3, pending: 0 });
    });

    it('hands the batch back untouched when the user changes between claim and push', async () => {
      await queue(db, 2);
      const { transport, pushes, state } = switchableTransport(USER_A);
      // The run starts as A; B signs in before the push.
      state.onCheck = (checks) => {
        if (checks === 1) state.user = USER_B;
      };

      expect(await runSync(db, transport, { now: () => T0 })).toEqual({
        kind: 'failed',
        reason: 'session_changed',
        batches: 0,
        records: 0,
      });

      expect(pushes).toHaveLength(0);
      const left = await db.all<{ status: string; attempts: number; next_attempt_at: string | null }>(
        'select status, attempts, next_attempt_at from outbox order by seq',
      );
      expect(left).toEqual([
        { status: 'pending', attempts: 0, next_attempt_at: null },
        { status: 'pending', attempts: 0, next_attempt_at: null },
      ]);
    });

    it('gives a retried record in that batch no extra attempt', async () => {
      await queue(db, 1);
      await runSync(db, fakeTransport(() => ({ results: [] })).transport, { now: () => T0 });
      // Record 1 is failed with one attempt, due again after 30 s.
      const later = new Date(T0.getTime() + 60_000);
      const { transport, state } = switchableTransport(USER_A);
      state.onCheck = (checks) => {
        if (checks === 1) state.user = USER_B;
      };

      await runSync(db, transport, { now: () => later });

      const [left] = await db.all<{ status: string; attempts: number }>('select status, attempts from outbox');
      expect(left).toEqual({ status: 'pending', attempts: 1 });
    });

    it('passes the claiming user to the transport', async () => {
      await queue(db, 1);
      const seen: string[] = [];
      const transport: SyncTransport = {
        currentUserId: async () => USER_A,
        push: async (batch, userId) => (seen.push(userId), acceptAll(batch)),
      };
      await runSync(db, transport, { now: () => T0 });
      expect(seen).toEqual([USER_A]);
    });
  });

  describe('review of #67: a re-save during the push, and a local failure after the claim', () => {
    const USER_B = '22222222-0000-4000-8000-00000000000b';

    /**
     * Wraps the database so a hook runs right after the next transaction once
     * armed: exactly the gap between applyVerdicts and the release that follows.
     */
    function hookedDb(inner: DeviceDb) {
      const state: { armed: (() => Promise<void>) | null; failNext: Error | null } = { armed: null, failNext: null };
      const db: DeviceDb = {
        ...inner,
        async transaction(fn) {
          if (state.failNext) {
            const error = state.failNext;
            state.failNext = null;
            throw error;
          }
          await inner.transaction(fn);
          const hook = state.armed;
          state.armed = null;
          if (hook) await hook();
        },
      };
      return { db, state };
    }

    it("a record re-saved during the push and claimed by another run is not failed by this run's release", async () => {
      await queue(db, 1); // record 1, saved by A
      const { db: hooked, state } = hookedDb(db);
      let otherRun: string[] = [];
      const transport: SyncTransport = {
        currentUserId: async () => USER_A,
        push: async (batch) => {
          // B edits record 1 while A's push is in flight: dirty, author B.
          await enqueue(db, { entity: 'material_transactions', recordId: ID(1), authorId: USER_B, payload: { qty: 9 } }, T0);
          // After applyVerdicts requeues it, B's engine claims it before A's release.
          state.armed = async () => {
            otherRun = (await claimBatch(db, USER_B, T0)).map((e) => e.recordId);
          };
          return acceptAll(batch);
        },
      };

      await runSync(hooked, transport, { now: () => T0 });

      expect(otherRun).toEqual([ID(1)]);
      const [row] = await db.all<{ status: string; reason: string | null }>('select status, reason from outbox');
      expect(row).toEqual({ status: 'syncing', reason: null }); // still B's, in flight
    });

    it('a local failure after the claim fails the batch with a backoff instead of leaving it syncing', async () => {
      await queue(db, 2);
      const { db: hooked, state } = hookedDb(db);
      const transport: SyncTransport = {
        currentUserId: async () => USER_A,
        push: async (batch) => {
          state.failNext = new Error('database is locked'); // applyVerdicts' transaction
          return acceptAll(batch);
        },
      };

      expect(await runSync(hooked, transport, { now: () => T0 })).toEqual({
        kind: 'failed',
        reason: 'local_error',
        batches: 0,
        records: 0,
      });

      const left = await db.all<{ status: string; reason: string; attempts: number }>(
        'select status, reason, attempts from outbox order by seq',
      );
      expect(left).toEqual([
        { status: 'failed', reason: 'local_error', attempts: 1 },
        { status: 'failed', reason: 'local_error', attempts: 1 },
      ]);
    });

    it('ignores a malformed result row and still applies the good ones', async () => {
      await queue(db, 2);
      const respond = (batch: SyncBatch): PushResponse => ({
        results: [
          { entity: 'material_transactions', record_id: null, verdict: 'accepted', reason: null } as unknown as SyncResultRow,
          { entity: batch.records[1]!.entity, record_id: batch.records[1]!.record_id, verdict: 'accepted', reason: null },
        ],
      });

      expect(await runSync(db, fakeTransport(respond).transport, { now: () => T0 })).toMatchObject({ kind: 'done' });

      expect(await status(db, 1)).toBe('failed'); // unanswered: no_result, retried later
      expect(await status(db, 2)).toBe('synced');
    });
  });

  describe('overlapping runs, e.g. a user switch while a push is in flight (#56)', () => {
    const USER_B = '22222222-0000-4000-8000-00000000000b';

    /** A gate the test opens by hand, so a push stays in flight until it does. */
    function gate() {
      let open!: () => void;
      const opened = new Promise<void>((resolve) => (open = resolve));
      return { opened, open };
    }
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    async function twoUsers() {
      let user = USER_A;
      const gates: Record<string, ReturnType<typeof gate>> = { [USER_A]: gate(), [USER_B]: gate() };
      const transport: SyncTransport = {
        currentUserId: async () => user,
        push: async (batch, userId) => {
          if (userId !== user) throw new SyncTransportError(SESSION_CHANGED);
          await gates[userId]!.opened;
          return acceptAll(batch);
        },
      };
      return { transport, gates, switchTo: (next: string) => (user = next) };
    }

    const enqueueAs = (n: number, authorId: string) =>
      enqueue(db, { entity: 'material_transactions', recordId: ID(n), authorId, payload: {} }, T0);

    it("finishing A's run leaves B's in-flight batch alone", async () => {
      await enqueueAs(1, USER_A);
      await enqueueAs(2, USER_B);
      const { transport, gates, switchTo } = await twoUsers();

      const runA = runSync(db, transport, { now: () => T0 });
      await settle();
      switchTo(USER_B);
      const runB = runSync(db, transport, { now: () => T0 });
      await settle();

      gates[USER_A]!.open();
      await runA;
      expect(await status(db, 2)).toBe('syncing');

      gates[USER_B]!.open();
      await runB;
      expect(await status(db, 1)).toBe('synced');
      expect(await status(db, 2)).toBe('synced');
    });

    it("A's refused next batch hands back only A's rows, not B's in-flight batch", async () => {
      for (let n = 1; n <= MAX_BATCH + 1; n += 1) await enqueueAs(n, USER_A);
      await enqueueAs(500, USER_B);
      const { transport, gates, switchTo } = await twoUsers();

      const runA = runSync(db, transport, { now: () => T0 });
      await settle();
      switchTo(USER_B);
      const runB = runSync(db, transport, { now: () => T0 });
      await settle();

      gates[USER_A]!.open();
      expect(await runA).toMatchObject({ kind: 'failed', reason: SESSION_CHANGED, batches: 1 });
      expect(await status(db, MAX_BATCH + 1)).toBe('pending');
      expect(await status(db, 500)).toBe('syncing');

      gates[USER_B]!.open();
      await runB;
      expect(await status(db, 500)).toBe('synced');
    });
  });

  it('sends the #33 envelope in capture order and applies the answers', async () => {
    await queue(db, 3);
    const { transport, pushes } = fakeTransport();

    const result = await runSync(db, transport, { now: () => T0 });

    expect(result).toEqual({ kind: 'done', batches: 1, records: 3 });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toEqual({
      version: 1,
      device_id: await getDeviceId(db),
      records: [1, 2, 3].map((n) => ({ entity: 'material_transactions', record_id: ID(n), payload: { qty: n } })),
    });
    expect((await countByStatus(db)).synced).toBe(3);
  });

  it('keeps one device id across runs', async () => {
    const first = await getDeviceId(db);
    await queue(db, 1);
    const { transport, pushes } = fakeTransport();
    await runSync(db, transport, { now: () => T0 });
    expect(pushes[0]!.device_id).toBe(first);
    expect(await getDeviceId(db)).toBe(first);
  });

  it('sends 100 at a time until the outbox is empty', async () => {
    await queue(db, 150);
    const { transport, pushes } = fakeTransport();

    expect(await runSync(db, transport, { now: () => T0 })).toEqual({ kind: 'done', batches: 2, records: 150 });

    expect(pushes.map((b) => b.records.length)).toEqual([100, 50]);
    expect((await countByStatus(db)).synced).toBe(150);
  });

  it('stops after maxBatches and leaves the rest pending', async () => {
    await queue(db, 150);
    const { transport, pushes } = fakeTransport();

    await runSync(db, transport, { now: () => T0, maxBatches: 1 });

    expect(pushes).toHaveLength(1);
    expect(await countByStatus(db)).toMatchObject({ synced: 100, pending: 50 });
  });

  it('applies a mix of verdicts record by record', async () => {
    await queue(db, 4);
    const verdicts: SyncResultRow['verdict'][] = ['accepted', 'conflict', 'rejected', 'retryable_error'];
    const { transport } = fakeTransport((batch) => ({
      results: batch.records.map((r, i) => ({
        entity: r.entity,
        record_id: r.record_id,
        verdict: verdicts[i]!,
        reason: i === 0 ? null : 'because',
      })),
    }));

    await runSync(db, transport, { now: () => T0 });

    expect([await status(db, 1), await status(db, 2), await status(db, 3), await status(db, 4)]).toEqual([
      'synced',
      'conflict',
      'rejected',
      'failed',
    ]);
  });

  it('fails the batch and stops when the network call throws', async () => {
    await queue(db, 150);
    const { transport, pushes } = fakeTransport(() => {
      throw new Error('Network request failed');
    });

    const result = await runSync(db, transport, { now: () => T0 });

    expect(result).toEqual({ kind: 'failed', reason: 'network', batches: 0, records: 0 });
    expect(pushes).toHaveLength(1);
    expect(await countByStatus(db)).toMatchObject({ failed: 100, pending: 50, syncing: 0 });
    expect(await getStatus(db, 'material_transactions', ID(1))).toEqual({ status: 'failed', reason: 'network' });
  });

  it('keeps the server error code from a SyncTransportError', async () => {
    await queue(db, 1);
    const { transport } = fakeTransport(() => {
      throw new SyncTransportError('server:28000');
    });

    expect(await runSync(db, transport, { now: () => T0 })).toMatchObject({
      kind: 'failed',
      reason: 'server:28000',
    });
    expect(await getStatus(db, 'material_transactions', ID(1))).toEqual({
      status: 'failed',
      reason: 'server:28000',
    });
  });

  it('fails the batch on a refused envelope, which is an app bug', async () => {
    await queue(db, 2);
    const { transport } = fakeTransport(() => ({ error: 'invalid_envelope', reason: 'duplicate_record' }));

    const result = await runSync(db, transport, { now: () => T0 });

    expect(result).toMatchObject({ kind: 'failed', reason: 'invalid_envelope:duplicate_record' });
    expect((await countByStatus(db)).failed).toBe(2);
  });

  it('fails the records the server did not answer, and keeps the answers it gave', async () => {
    await queue(db, 3);
    const { transport } = fakeTransport((batch) => ({
      results: [{ entity: batch.records[0]!.entity, record_id: batch.records[0]!.record_id, verdict: 'accepted', reason: null }],
    }));

    expect(await runSync(db, transport, { now: () => T0 })).toEqual({ kind: 'done', batches: 1, records: 3 });

    expect(await status(db, 1)).toBe('synced');
    expect(await getStatus(db, 'material_transactions', ID(2))).toEqual({ status: 'failed', reason: 'no_result' });
    expect(await status(db, 3)).toBe('failed');
  });

  it('fails the batch on a response with no results array', async () => {
    await queue(db, 1);
    const { transport } = fakeTransport(() => ({ results: 'nope' }) as unknown as PushResponse);

    expect(await runSync(db, transport, { now: () => T0 })).toMatchObject({ kind: 'failed', reason: 'bad_response' });
    expect(await status(db, 1)).toBe('failed');
  });

  it('does nothing when the outbox is empty', async () => {
    const { transport, pushes } = fakeTransport();
    expect(await runSync(db, transport, { now: () => T0 })).toEqual({ kind: 'done', batches: 0, records: 0 });
    expect(pushes).toHaveLength(0);
  });
});

describe('singleFlight', () => {
  it('shares one run between overlapping calls, then allows the next', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const run = singleFlight(async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return calls;
    });

    const a = run();
    const b = run();
    release();
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(calls).toBe(1);

    const c = run();
    release();
    expect(await c).toBe(2);
  });

  it('allows a new run after one fails', async () => {
    let calls = 0;
    const run = singleFlight(async () => {
      calls += 1;
      if (calls === 1) throw new Error('first fails');
      return calls;
    });
    await expect(run()).rejects.toThrow('first fails');
    expect(await run()).toBe(2);
  });
});

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import {
  PULL_INTERVAL_MS,
  REQUEST_DEBOUNCE_MS,
  startSyncEngine,
  SYNC_INTERVAL_MS,
  type SyncEnv,
  type SyncStatus,
} from '../engine';
import { mirrorInfo, type MirrorSource } from '../pull';
import { applyVerdicts, claimBatch, enqueue } from '../outbox';
import type { PushResponse, SyncBatch, SyncTransport } from '../sender';

// Jest hoists jest.mock above the imports. The engine imports NetInfo for its
// real triggers; the tests drive triggers by hand, so the official mock is enough.
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
jest.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: () => `dddddddd-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
  };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Triggers the test fires by hand, and timers it can inspect. */
function fakeEnv() {
  const fg = new Set<() => void>();
  const net = new Set<() => void>();
  const intervals: { ms: number; fn: () => void }[] = [];
  const timers: { ms: number; fn: () => void; cancelled: boolean }[] = [];
  const env: SyncEnv = {
    onForeground: (fn) => (fg.add(fn), () => fg.delete(fn)),
    onReconnect: (fn) => (net.add(fn), () => net.delete(fn)),
    every: (ms, fn) => {
      const entry = { ms, fn };
      intervals.push(entry);
      return () => intervals.splice(intervals.indexOf(entry), 1);
    },
    after: (ms, fn) => {
      const entry = { ms, fn, cancelled: false };
      timers.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  };
  return {
    env,
    foreground: () => fg.forEach((fn) => fn()),
    reconnect: () => net.forEach((fn) => fn()),
    tick: () => intervals.forEach((i) => i.fn()),
    fireTimers: () => timers.filter((t) => !t.cancelled).forEach((t) => ((t.cancelled = true), t.fn())),
    intervals,
    timers,
    listenerCount: () => fg.size + net.size + intervals.length,
  };
}

function countingTransport(signedIn = true) {
  const pushes: SyncBatch[] = [];
  let sessionChecks = 0;
  const transport: SyncTransport = {
    currentUserId: async () => {
      sessionChecks += 1;
      return signedIn ? USER_A : null;
    },
    push: async (batch): Promise<PushResponse> => {
      pushes.push(batch);
      return {
        results: batch.records.map((r) => ({
          entity: r.entity,
          record_id: r.record_id,
          verdict: 'accepted' as const,
          reason: null,
        })),
      };
    },
  };
  return { transport, pushes, runs: () => sessionChecks };
}

describe('startSyncEngine', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it('syncs once at start, and publishes counts and the result', async () => {
    await enqueue(db, { entity: 'material_transactions', recordId: ID(1), authorId: USER_A, payload: {} });
    const { env } = fakeEnv();
    const { transport, pushes } = countingTransport();
    const seen: SyncStatus[] = [];

    const handle = startSyncEngine(db, transport, env);
    handle.subscribe((s) => seen.push(s));
    const result = await handle.syncNow(); // joins the run started at start

    expect(result).toEqual({ kind: 'done', batches: 1, records: 1 });
    expect(pushes).toHaveLength(1);
    expect(handle.getStatus()).toMatchObject({ running: false, last: result });
    expect(handle.getStatus().counts.synced).toBe(1);
    expect(seen.some((s) => s.running)).toBe(true);
    handle.stop();
  });

  it('syncs again when the app comes to the foreground, the network returns, and every minute', async () => {
    const f = fakeEnv();
    const { transport, runs } = countingTransport();
    const handle = startSyncEngine(db, transport, f.env);
    await handle.syncNow();
    const afterStart = runs();

    f.foreground();
    await handle.syncNow();
    f.reconnect();
    await handle.syncNow();
    f.tick();
    await handle.syncNow();

    expect(runs()).toBeGreaterThanOrEqual(afterStart + 3);
    expect(f.intervals.map((i) => i.ms)).toEqual([SYNC_INTERVAL_MS]);
    handle.stop();
  });

  it('shares one run between overlapping triggers', async () => {
    const f = fakeEnv();
    const { transport, runs } = countingTransport();
    const handle = startSyncEngine(db, transport, f.env);

    f.foreground();
    f.reconnect();
    f.tick();
    await handle.syncNow();

    expect(runs()).toBe(1);
    handle.stop();
  });

  it('debounces requestSync into one run', async () => {
    const f = fakeEnv();
    const { transport, runs } = countingTransport();
    const handle = startSyncEngine(db, transport, f.env);
    await handle.syncNow();
    const before = runs();

    handle.requestSync();
    handle.requestSync();
    expect(f.timers.filter((t) => !t.cancelled).map((t) => t.ms)).toEqual([REQUEST_DEBOUNCE_MS]);

    f.fireTimers();
    await handle.syncNow();
    expect(runs()).toBe(before + 1);
    handle.stop();
  });

  it('reports signed out without sending', async () => {
    await enqueue(db, { entity: 'material_transactions', recordId: ID(1), authorId: USER_A, payload: {} });
    const { env } = fakeEnv();
    const { transport, pushes } = countingTransport(false);
    const handle = startSyncEngine(db, transport, env);

    expect(await handle.syncNow()).toEqual({ kind: 'signed_out' });
    expect(pushes).toHaveLength(0);
    expect(handle.getStatus().counts.pending).toBe(1);
    handle.stop();
  });

  it('keeps an error inside a run as the result instead of throwing', async () => {
    const { env } = fakeEnv();
    const transport: SyncTransport = {
      currentUserId: async () => {
        throw new Error('storage unavailable');
      },
      push: async () => ({ results: [] }),
    };
    const handle = startSyncEngine(db, transport, env);

    expect(await handle.syncNow()).toEqual({
      kind: 'failed',
      reason: 'local:storage unavailable',
      batches: 0,
      records: 0,
    });
    expect(handle.getStatus().running).toBe(false);
    handle.stop();
  });

  it('stops listening when stopped', async () => {
    const f = fakeEnv();
    const { transport, runs } = countingTransport();
    const handle = startSyncEngine(db, transport, f.env);
    await handle.syncNow();
    const before = runs();

    handle.stop();
    f.foreground();
    f.reconnect();
    handle.requestSync();

    expect(f.listenerCount()).toBe(0);
    expect(runs()).toBe(before);
  });

  describe('per-user status and retry now (#68)', () => {
    const USER_B = '22222222-0000-4000-8000-00000000000b';
    const save = (n: number, authorId: string) =>
      enqueue(db, { entity: 'material_transactions', recordId: ID(n), authorId, payload: {} });

    it("counts and lists only the signed-in user's records when given a user", async () => {
      await save(1, USER_A);
      await save(2, USER_B);
      await claimBatch(db, USER_B);
      await applyVerdicts(db, [
        { entity: 'material_transactions', record_id: ID(2), verdict: 'rejected', reason: 'permission_denied' },
      ]);
      const { env } = fakeEnv();
      const { transport } = countingTransport(false); // signed out: nothing is sent, counts stay

      const handle = startSyncEngine(db, transport, env, { userId: USER_A });
      await handle.syncNow();

      expect(handle.getStatus()).toMatchObject({ userId: USER_A, attention: [] });
      expect(handle.getStatus().counts).toMatchObject({ pending: 1, rejected: 0 });
      handle.stop();

      const all = startSyncEngine(db, transport, env);
      await all.syncNow();
      expect(all.getStatus().userId).toBeNull();
      expect(all.getStatus().counts).toMatchObject({ pending: 1, rejected: 1 });
      expect(all.getStatus().attention.map((r) => r.reason)).toEqual(['permission_denied']);
      all.stop();
    });

    it('retryNow sends a record that is backing off, in one run', async () => {
      await save(1, USER_A);
      await claimBatch(db, USER_A);
      await applyVerdicts(db, [
        { entity: 'material_transactions', record_id: ID(1), verdict: 'retryable_error', reason: 'busy' },
      ]);
      const { env } = fakeEnv();
      const { transport, pushes } = countingTransport();
      const handle = startSyncEngine(db, transport, env, { userId: USER_A });
      await handle.syncNow();
      expect(pushes).toHaveLength(0); // still backing off

      const result = await handle.retryNow();

      expect(result).toEqual({ kind: 'done', batches: 1, records: 1 });
      expect(pushes).toHaveLength(1);
      expect(handle.getStatus().counts.synced).toBe(1);
      handle.stop();
    });
  });

  describe('pull after sync (#49)', () => {
    /** A server with one site for USER_A; counts how many pulls ran. */
    function mirrorSource(fail = false) {
      let pulls = 0;
      const source: MirrorSource = {
        currentUserId: async () => USER_A,
        fetchPage: async (kind, _userId, from) => {
          if (kind === 'sites' && from === 0) pulls += 1;
          if (fail) throw new Error('boom');
          if (kind !== 'sites' || from > 0) return [];
          return [
            {
              id: '51000000-0000-4000-8000-000000000001',
              name: 'Kothrud',
              address: 'Pune',
              latitude: 18.5,
              longitude: 73.8,
              geofence_radius_m: 200,
              status: 'active',
            },
          ];
        },
      };
      return { source, pulls: () => pulls };
    }

    it('pulls once at start, then at most every 5 minutes, and Sync now forces one', async () => {
      let clock = 1_000_000;
      const f = fakeEnv();
      const { transport } = countingTransport();
      const m = mirrorSource();
      const handle = startSyncEngine(db, transport, f.env, {
        userId: USER_A,
        mirrorSource: m.source,
        now: () => clock,
      });

      await handle.syncNow();
      expect(m.pulls()).toBe(1);
      expect(handle.getStatus().lastPull).toEqual({ kind: 'done', sites: 1, materials: 0, roster: 0 });
      expect((await mirrorInfo(db))?.userId).toBe(USER_A);

      clock += PULL_INTERVAL_MS - 1;
      f.tick();
      await handle.syncNow();
      expect(m.pulls()).toBe(1);

      clock += 1;
      f.tick();
      await handle.syncNow();
      expect(m.pulls()).toBe(2);

      await handle.retryNow();
      expect(m.pulls()).toBe(3);
      handle.stop();
    });

    it('keeps the sync result when the pull fails, and tries the pull again on the next run', async () => {
      const f = fakeEnv();
      const { transport } = countingTransport();
      const m = mirrorSource(true);
      const handle = startSyncEngine(db, transport, f.env, { userId: USER_A, mirrorSource: m.source });

      const result = await handle.syncNow();

      expect(result).toEqual({ kind: 'done', batches: 0, records: 0 });
      expect(handle.getStatus()).toMatchObject({ last: result, lastPull: { kind: 'failed', reason: 'boom' } });
      f.tick();
      await handle.syncNow();
      expect(m.pulls()).toBe(2);
      handle.stop();
    });

    it('does not pull while signed out, or without a mirror source', async () => {
      const f = fakeEnv();
      const m = mirrorSource();
      const signedOut = startSyncEngine(db, countingTransport(false).transport, f.env, { mirrorSource: m.source });
      await signedOut.syncNow();
      expect(m.pulls()).toBe(0);
      expect(signedOut.getStatus().lastPull).toBeNull();
      signedOut.stop();

      const noSource = startSyncEngine(db, countingTransport().transport, f.env);
      await noSource.syncNow();
      expect(noSource.getStatus().lastPull).toBeNull();
      noSource.stop();
    });
  });
});

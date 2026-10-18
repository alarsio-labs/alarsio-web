import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { REQUEST_DEBOUNCE_MS, startSyncEngine, SYNC_INTERVAL_MS, type SyncEnv, type SyncStatus } from '../engine';
import { enqueue } from '../outbox';
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
    hasSession: async () => {
      sessionChecks += 1;
      return signedIn;
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
    await enqueue(db, { entity: 'material_transactions', recordId: ID(1), payload: {} });
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
    await enqueue(db, { entity: 'material_transactions', recordId: ID(1), payload: {} });
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
      hasSession: async () => {
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
});

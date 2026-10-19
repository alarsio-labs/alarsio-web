// When to sync, and what the app shows about it. Owner: Offline Sync (Nikhil).
// Issues #47, #68. The events come through SyncEnv, so tests drive them by hand.

import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import type { DeviceDb } from '../db/device-db';
import type { OutboxStatus } from './entities';
import { countByStatus, listAttention, retryFailedNow, type AttentionRow } from './outbox';
import { runSync, singleFlight, type SyncRunResult, type SyncTransport } from './sender';

export const SYNC_INTERVAL_MS = 60_000;
export const REQUEST_DEBOUNCE_MS = 2_000;

export interface SyncStatus {
  /** This user's records per status, or every user's when no user was given. */
  counts: Record<OutboxStatus, number>;
  /** Conflict and rejected records, newest first, for the same user. */
  attention: AttentionRow[];
  /** The user signed in on the phone, as the app knows it, or null. */
  userId: string | null;
  /** The last finished run, or null before the first one. */
  last: SyncRunResult | null;
  running: boolean;
}

export interface SyncHandle {
  /** Ask for a sync soon, e.g. right after a capture screen saves a record. */
  requestSync(): void;
  /** Run now and wait for it. */
  syncNow(): Promise<SyncRunResult>;
  /** The "Sync now" button: this user's failed records skip their backoff, then run. */
  retryNow(): Promise<SyncRunResult>;
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  stop(): void;
}

/** Where the triggers come from. Each returns a function that unsubscribes. */
export interface SyncEnv {
  onForeground(listener: () => void): () => void;
  onReconnect(listener: () => void): () => void;
  every(ms: number, listener: () => void): () => void;
  after(ms: number, listener: () => void): () => void;
}

export const realSyncEnv: SyncEnv = {
  onForeground(listener) {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') listener();
    });
    return () => sub.remove();
  },
  onReconnect(listener) {
    let wasOnline: boolean | null = null;
    return NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (online && wasOnline === false) listener();
      wasOnline = online;
    });
  },
  every(ms, listener) {
    const id = setInterval(listener, ms);
    return () => clearInterval(id);
  },
  after(ms, listener) {
    const id = setTimeout(listener, ms);
    return () => clearTimeout(id);
  },
};

export interface SyncEngineOptions {
  /**
   * The user signed in on the phone. Counts and the attention list are theirs
   * only (ADR-020). The app knows this even offline, from the stored session.
   */
  userId?: string;
}

/**
 * Starts syncing for this app session: once now, then on foreground, on
 * reconnect, every minute, and shortly after requestSync(). Runs of this
 * engine never overlap; another engine's may (ADR-016, ADR-018 amendments).
 * Errors inside a run are kept in `last`, never thrown at a trigger.
 */
export function startSyncEngine(
  db: DeviceDb,
  transport: SyncTransport,
  env: SyncEnv = realSyncEnv,
  { userId }: SyncEngineOptions = {},
): SyncHandle {
  const listeners = new Set<(status: SyncStatus) => void>();
  let status: SyncStatus = {
    counts: { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 },
    attention: [],
    userId: userId ?? null,
    last: null,
    running: false,
  };
  let stopped = false;
  let cancelPending: (() => void) | null = null;

  const publish = (next: Partial<SyncStatus>) => {
    status = { ...status, ...next };
    for (const listener of listeners) listener(status);
  };

  const refreshCounts = async () => {
    publish({ counts: await countByStatus(db, userId), attention: await listAttention(db, userId) });
  };

  const run = singleFlight(async (): Promise<SyncRunResult> => {
    publish({ running: true });
    let result: SyncRunResult;
    try {
      result = await runSync(db, transport);
    } catch (error) {
      // A local failure (database, a bug): keep it visible, and keep the app alive.
      const reason = error instanceof Error ? error.message : String(error);
      result = { kind: 'failed', reason: `local:${reason}`, batches: 0, records: 0 };
    }
    await refreshCounts().catch(() => undefined);
    publish({ running: false, last: result });
    return result;
  });

  const trigger = () => {
    if (!stopped) void run();
  };

  const unsubscribers = [
    env.onForeground(trigger),
    env.onReconnect(trigger),
    env.every(SYNC_INTERVAL_MS, trigger),
  ];

  void refreshCounts().catch(() => undefined);
  trigger();

  return {
    requestSync() {
      if (stopped) return;
      cancelPending?.();
      cancelPending = env.after(REQUEST_DEBOUNCE_MS, () => {
        cancelPending = null;
        trigger();
      });
    },
    syncNow: () => run(),
    async retryNow() {
      await retryFailedNow(db, userId);
      return run();
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      stopped = true;
      cancelPending?.();
      for (const unsubscribe of unsubscribers) unsubscribe();
      listeners.clear();
    },
  };
}

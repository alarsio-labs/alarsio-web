// When to sync, and what the app shows about it. Owner: Offline Sync (Nikhil).
// Issues #47, #68, #49, #69. The events come through SyncEnv, so tests drive them by hand.
// An engine belongs to one user (ADR-029): it counts, lists, retries and sends
// for that user only.

import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import type { DeviceDb } from '../db/device-db';
import type { OutboxStatus } from './entities';
import { countByStatus, listAttention, retryFailedNow, type AttentionRow } from './outbox';
import { mirrorSummary, runPull, type MirrorSource, type MirrorSummary, type PullResult } from './pull';
import { runSync, singleFlight, type SyncRunResult, type SyncTransport } from './sender';

export const SYNC_INTERVAL_MS = 60_000;
export const REQUEST_DEBOUNCE_MS = 2_000;
/** How many refused records the status keeps; the rest are counted, not listed. */
export const ATTENTION_LIMIT = 50;
/** A full refresh of the mirrors at most this often, unless Sync now asks for one. */
export const PULL_INTERVAL_MS = 5 * 60_000;

export interface SyncStatus {
  /** This user's records per status. Zeros until `loaded`. */
  counts: Record<OutboxStatus, number>;
  /** This user's conflict and rejected records, newest first, at most ATTENTION_LIMIT. */
  attention: AttentionRow[];
  /** The counts have been read from the phone at least once. */
  loaded: boolean;
  /** The latest read of the counts failed, so they may be stale or still zero. */
  readFailed: boolean;
  /** The user this engine belongs to. */
  userId: string | null;
  /** The last pull of the mirrors, or null before the first one (#49). */
  lastPull: PullResult | null;
  /** What the phone holds for this user, from an earlier session too; null if nothing. */
  mirror: MirrorSummary | null;
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
   * The user this engine belongs to. Required, so there is no engine that
   * covers every user (ADR-020, ADR-029). The app knows this even offline, from
   * the stored session, which the transport may not.
   */
  userId: string;
  /** Where the mirrors come from. Without it, nothing is pulled. */
  mirrorSource?: MirrorSource;
  /** The clock for the pull interval, in ms. Tests pass their own. */
  now?: () => number;
}

/**
 * The transport as this engine's user sees it: anyone else's session counts as
 * no session. So an engine never claims and sends one user's records under
 * another's, and what the screen shows is what gets sent.
 */
function boundTo(transport: SyncTransport, userId: string): SyncTransport {
  return {
    currentUserId: async () => {
      const id = await transport.currentUserId();
      return id !== null && id.toLowerCase() === userId.toLowerCase() ? id : null;
    },
    push: (batch, uid) => transport.push(batch, uid),
  };
}

/**
 * Starts syncing for one user: once now, then on foreground, on reconnect,
 * every minute, and shortly after requestSync(). Runs of this engine never
 * overlap; another engine's may (ADR-016, ADR-018 amendments). Errors inside a
 * run are kept in `last`, never thrown at a trigger.
 */
export function startSyncEngine(
  db: DeviceDb,
  rawTransport: SyncTransport,
  { userId, mirrorSource, now = Date.now }: SyncEngineOptions,
  env: SyncEnv = realSyncEnv,
): SyncHandle {
  const transport = boundTo(rawTransport, userId);
  const listeners = new Set<(status: SyncStatus) => void>();
  let status: SyncStatus = {
    counts: { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 },
    attention: [],
    loaded: false,
    readFailed: false,
    userId,
    lastPull: null,
    mirror: null,
    last: null,
    running: false,
  };
  let stopped = false;
  let cancelPending: (() => void) | null = null;
  let lastPullAt: number | null = null;
  let forcePull = false;

  const publish = (next: Partial<SyncStatus>) => {
    status = { ...status, ...next };
    for (const listener of listeners) listener(status);
  };

  // A failed read is kept as a state, not hidden: the screen must not claim
  // "all on the server" about counts it could not read.
  const refreshCounts = async () => {
    try {
      const counts = await countByStatus(db, userId);
      const attention = await listAttention(db, userId, ATTENTION_LIMIT);
      publish({ counts, attention, loaded: true, readFailed: false });
    } catch {
      publish({ readFailed: true });
    }
  };

  const localFailure = (): SyncRunResult => ({ kind: 'failed', reason: 'local_error', batches: 0, records: 0 });

  // What the phone holds, so the screen can show it with no network and after a
  // failed pull. Only this user's: another user's copy reads as nothing.
  const refreshMirror = async () => {
    try {
      publish({ mirror: userId ? await mirrorSummary(db, userId) : null });
    } catch {
      publish({ mirror: null });
    }
  };

  const run = singleFlight(async (): Promise<SyncRunResult> => {
    publish({ running: true });
    let result: SyncRunResult;
    try {
      result = await runSync(db, transport);
    } catch {
      // A local failure (database, a bug): keep it visible, and keep the app alive.
      // The message stays out of the status: it can name files and data.
      result = localFailure();
    }
    await refreshCounts();
    // Pull after the push, so the server balance already includes what was sent.
    if (mirrorSource && result.kind !== 'signed_out' && pullDue()) {
      forcePull = false;
      // runPull reports its own failures; the message of anything else can name files.
      const pulled = await runPull(db, mirrorSource).catch((): PullResult => ({ kind: 'failed', reason: 'local_error' }));
      // Only a finished pull resets the clock, so a failed one is tried next run.
      if (pulled.kind === 'done') lastPullAt = now();
      publish({ lastPull: pulled });
      await refreshMirror();
    }
    publish({ running: false, last: result });
    return result;
  });

  const pullDue = () => forcePull || lastPullAt === null || now() - lastPullAt >= PULL_INTERVAL_MS;

  const trigger = () => {
    if (!stopped) void run();
  };

  const unsubscribers = [
    env.onForeground(trigger),
    env.onReconnect(trigger),
    env.every(SYNC_INTERVAL_MS, trigger),
  ];

  void refreshCounts();
  void refreshMirror();
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
      try {
        await retryFailedNow(db, userId);
      } catch {
        // Surface it like a failed run, instead of rejecting into a button handler.
        const result = localFailure();
        publish({ last: result });
        return result;
      }
      forcePull = true;
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

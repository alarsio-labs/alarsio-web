// The sender: takes batches from the outbox, sends them to sync_push, and
// applies the answers. Owner: Offline Sync (Nikhil). Issue #47.
// Envelope and verdicts: #33, ADR-009, ADR-014. Outbox rules: ADR-016, ADR-020.
//
// It talks to the server only through a SyncTransport, so every path here is
// tested without a network, and the real transport (Supabase) is one small file.

import type { DeviceDb } from '../db/device-db';
import { getDeviceId } from './device-id';
import type { SyncEntity, SyncResultRow } from './entities';
import {
  applyVerdicts,
  claimBatch,
  releaseBatch,
  returnBatch,
  unanswered,
  type OutboxEntry,
  type OutboxKey,
  type Payload,
} from './outbox';

export const MAX_BATCHES_PER_RUN = 5;

export interface SyncBatch {
  version: 1;
  device_id: string;
  records: { entity: SyncEntity; record_id: string; payload: Payload }[];
}

/** What sync_push answers: results per record, or a refused envelope. */
export type PushResponse =
  | { results: SyncResultRow[] }
  | { error: 'invalid_envelope'; reason: string };

export interface SyncTransport {
  /** The signed-in user's id, or null when no one is signed in. */
  currentUserId(): Promise<string | null>;
  /**
   * Sends one batch under `userId`'s session, and only that session. If someone
   * else is signed in by now, throws SyncTransportError('session_changed')
   * without sending. Throws SyncTransportError when the call itself fails.
   */
  push(batch: SyncBatch, userId: string): Promise<PushResponse>;
}

/** The signed-in user changed after the batch was claimed (ADR-020). */
export const SESSION_CHANGED = 'session_changed';

/** The call did not reach sync_push or did not complete. `reason` is a short code. */
export class SyncTransportError extends Error {
  constructor(readonly reason: string) {
    super(`sync push failed: ${reason}`);
    this.name = 'SyncTransportError';
  }
}

export type SyncRunResult =
  | { kind: 'signed_out' }
  | { kind: 'done'; batches: number; records: number }
  | { kind: 'failed'; reason: string; batches: number; records: number };

export interface RunSyncOptions {
  now?: () => Date;
  maxBatches?: number;
}

/**
 * Sends everything due for the signed-in user, one batch at a time, up to
 * `maxBatches`. Nothing is claimed when no one is signed in, so records are not
 * marked failed for a reason that is not theirs, and another user's records
 * wait for that user (ADR-020). A failed push stops the run; the outbox's
 * backoff decides when those records go again.
 */
export async function runSync(
  db: DeviceDb,
  transport: SyncTransport,
  { now = () => new Date(), maxBatches = MAX_BATCHES_PER_RUN }: RunSyncOptions = {},
): Promise<SyncRunResult> {
  const userId = await transport.currentUserId();
  if (userId === null) return { kind: 'signed_out' };

  const deviceId = await getDeviceId(db);
  let batches = 0;
  let records = 0;

  while (batches < maxBatches) {
    const claimed = await claimBatch(db, userId, now());
    if (claimed.length === 0) break;

    const failure = await sendClaimed(db, transport, userId, deviceId, claimed, now);
    if (failure) return { kind: 'failed', reason: failure, batches, records };

    batches += 1;
    records += claimed.length;
  }

  return { kind: 'done', batches, records };
}

/**
 * Sends one claimed batch and settles every row this run still owns. Returns
 * a failure reason that stops the run, or null. A local failure (the database,
 * a bug) fails the rows still owned with a backoff, rather than leaving them
 * syncing until the next app start (#67).
 */
async function sendClaimed(
  db: DeviceDb,
  transport: SyncTransport,
  userId: string,
  deviceId: string,
  claimed: readonly OutboxEntry[],
  now: () => Date,
): Promise<string | null> {
  // The rows this run still owns: the batch, until the server answers some.
  let outstanding: readonly OutboxKey[] = claimed;
  try {
    const batch: SyncBatch = {
      version: 1,
      device_id: deviceId,
      records: claimed.map((e) => ({ entity: e.entity, record_id: e.recordId, payload: e.payload })),
    };

    let response: PushResponse;
    try {
      response = await transport.push(batch, userId);
    } catch (error) {
      const reason = error instanceof SyncTransportError ? error.reason : 'network';
      if (reason === SESSION_CHANGED) {
        // Nothing was sent. Hand the batch back untouched for its author's next session.
        await returnBatch(db, claimed, now());
      } else {
        await releaseBatch(db, claimed, reason, now());
      }
      outstanding = [];
      return reason;
    }

    if ('error' in response || !Array.isArray(response.results)) {
      // A refused envelope is a bug in this app, not in a record.
      const reason = 'error' in response ? `invalid_envelope:${response.reason}` : 'bad_response';
      await releaseBatch(db, claimed, reason, now());
      outstanding = [];
      return reason;
    }

    await applyVerdicts(db, response.results, now());
    // Release only what the server did not answer. An answered row may already
    // be pending again (re-saved during the push) and claimed by another run;
    // matching it by key and status here would fail that run's row (#67).
    outstanding = unanswered(claimed, response.results);
    await releaseBatch(db, outstanding, 'no_result', now());
    outstanding = [];
    return null;
  } catch {
    await releaseBatch(db, outstanding, 'local_error', now()).catch(() => undefined);
    return 'local_error';
  }
}

/**
 * Wraps a run so that overlapping triggers share one run instead of starting
 * a second (ADR-016). Runs from two engines, e.g. across a user switch, may
 * still overlap; each releases only the batch it claimed, so that is safe.
 */
export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | null = null;
  return () => {
    if (!current) {
      current = run().finally(() => {
        current = null;
      });
    }
    return current;
  };
}

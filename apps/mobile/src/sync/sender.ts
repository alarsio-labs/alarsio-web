// The sender: takes batches from the outbox, sends them to sync_push, and
// applies the answers. Owner: Offline Sync (Nikhil). Issue #47.
// Envelope and verdicts: #33, ADR-009, ADR-014. Outbox rules: ADR-016, ADR-020.
//
// It talks to the server only through a SyncTransport, so every path here is
// tested without a network, and the real transport (Supabase) is one small file.

import type { DeviceDb } from '../db/device-db';
import { getDeviceId } from './device-id';
import type { SyncEntity, SyncResultRow } from './entities';
import { applyVerdicts, claimBatch, recoverInterrupted, releaseBatch, type Payload } from './outbox';

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
        await recoverInterrupted(db, now());
        return { kind: 'failed', reason, batches, records };
      }
      await releaseBatch(db, reason, now());
      return { kind: 'failed', reason, batches, records };
    }

    if ('error' in response) {
      // The server refused the envelope, which is a bug in this app, not in a record.
      const reason = `invalid_envelope:${response.reason}`;
      await releaseBatch(db, reason, now());
      return { kind: 'failed', reason, batches, records };
    }
    if (!Array.isArray(response.results)) {
      await releaseBatch(db, 'bad_response', now());
      return { kind: 'failed', reason: 'bad_response', batches, records };
    }

    await applyVerdicts(db, response.results, now());
    // Anything the server did not answer is still syncing. One batch is in
    // flight at a time, so releasing every syncing row releases only those.
    await releaseBatch(db, 'no_result', now());

    batches += 1;
    records += claimed.length;
  }

  return { kind: 'done', batches, records };
}

/**
 * Wraps a run so that overlapping triggers share one run instead of starting
 * a second, which the outbox does not allow (ADR-016: one batch in flight).
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

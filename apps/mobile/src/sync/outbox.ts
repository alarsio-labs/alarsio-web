// The device outbox: every field record waits here until sync_push accepts it.
// Owner: Offline Sync (Nikhil). Issue #39. Rules: ADR-009, ADR-016, ADR-020.
//
// One row per (entity, record_id), owned by the user who last saved it, and
// sent only while that user is signed in (#54). seq is the send order, so a parent captured
// before its child is also sent before it. Only an `accepted` verdict makes a
// row `synced`, which is the only state the app may call "submitted".

import * as Crypto from 'expo-crypto';

import type { DeviceDb } from '../db/device-db';
import {
  isSyncEntity,
  OUTBOX_STATUSES,
  type OutboxStatus,
  type SyncEntity,
  type SyncResultRow,
} from './entities';

export const MAX_BATCH = 100;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 30 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Payload = Record<string, unknown>;

export interface OutboxEntry {
  entity: SyncEntity;
  recordId: string;
  payload: Payload;
}

/** A record to save, with the signed-in user who saved it. */
export interface NewOutboxEntry extends OutboxEntry {
  authorId: string;
}

export interface OutboxRecordStatus {
  status: OutboxStatus;
  reason: string | null;
}

interface ClaimRow {
  seq: number;
  entity: SyncEntity;
  record_id: string;
  payload: string;
}

/** A device-made id for a new field record. It becomes the row's id on the server. */
export function newRecordId(): string {
  return Crypto.randomUUID();
}

/**
 * How long to wait before retrying a record that has failed `attempts` times:
 * 30 s, 60 s, 2 min, … capped at 30 min.
 */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
}

/**
 * Saves a record to send. A new (entity, record_id) is queued as pending. An
 * existing one takes the new payload and keeps its place in the order. If its
 * batch is in flight it is marked dirty, so the new payload goes out next; if
 * not, it is pending again with its retries reset. Either way the saver becomes
 * its author, since they are responsible for the latest payload.
 */
export async function enqueue(db: DeviceDb, entry: NewOutboxEntry, now: Date = new Date()): Promise<void> {
  if (!isSyncEntity(entry.entity)) {
    throw new Error(`unknown sync entity: ${String(entry.entity)}`);
  }
  if (!UUID.test(entry.recordId)) {
    throw new Error(`record id is not a uuid: ${entry.recordId}`);
  }
  if (typeof entry.authorId !== 'string' || !UUID.test(entry.authorId)) {
    throw new Error('author id is not a uuid');
  }
  if (typeof entry.payload !== 'object' || entry.payload === null || Array.isArray(entry.payload)) {
    throw new Error('payload must be a plain object');
  }

  const at = now.toISOString();
  // In the update branch every column on the right reads the existing row, so
  // all the case expressions test the status as it was before this save.
  await db.run(
    `insert into outbox (entity, record_id, author_id, payload, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?)
     on conflict (entity, record_id) do update set
       payload         = excluded.payload,
       author_id       = excluded.author_id,
       updated_at      = excluded.updated_at,
       dirty           = case when status = 'syncing' then 1 else 0 end,
       reason          = case when status = 'syncing' then reason else null end,
       attempts        = case when status = 'syncing' then attempts else 0 end,
       next_attempt_at = case when status = 'syncing' then next_attempt_at else null end,
       status          = case when status = 'syncing' then 'syncing' else 'pending' end`,
    [
      entry.entity,
      entry.recordId.toLowerCase(),
      entry.authorId.toLowerCase(),
      JSON.stringify(entry.payload),
      at,
      at,
    ],
  );
}

/**
 * Takes the next batch to send for one user, oldest first: their pending rows,
 * and their failed rows whose retry is due. They are marked syncing in the same
 * transaction. Other users' rows wait until those users sign in again.
 */
export async function claimBatch(
  db: DeviceDb,
  authorId: string,
  now: Date = new Date(),
  limit: number = MAX_BATCH,
): Promise<OutboxEntry[]> {
  const at = now.toISOString();
  let rows: ClaimRow[] = [];
  await db.transaction(async () => {
    rows = await db.all<ClaimRow>(
      `select seq, entity, record_id, payload from outbox
        where author_id = ?
          and (status = 'pending'
               or (status = 'failed' and (next_attempt_at is null or next_attempt_at <= ?)))
        order by seq
        limit ?`,
      [authorId.toLowerCase(), at, Math.min(Math.max(limit, 1), MAX_BATCH)],
    );
    for (const row of rows) {
      await db.run(`update outbox set status = 'syncing', updated_at = ? where seq = ?`, [at, row.seq]);
    }
  });
  return rows.map((row) => ({
    entity: row.entity,
    recordId: row.record_id,
    payload: JSON.parse(row.payload) as Payload,
  }));
}

/**
 * Applies sync_push's answers. Only rows still syncing are touched, so a late or
 * unknown result changes nothing. A dirty row goes back to pending whatever the
 * verdict, so an edit made during the push is never lost.
 */
export async function applyVerdicts(
  db: DeviceDb,
  results: readonly SyncResultRow[],
  now: Date = new Date(),
): Promise<void> {
  const at = now.toISOString();
  await db.transaction(async () => {
    for (const result of results) {
      const [row] = await db.all<{ seq: number; dirty: number; attempts: number }>(
        `select seq, dirty, attempts from outbox
          where entity = ? and record_id = ? and status = 'syncing'`,
        [result.entity, result.record_id.toLowerCase()],
      );
      if (!row) continue;

      if (row.dirty === 1) {
        await requeue(db, row.seq, at);
        continue;
      }

      switch (result.verdict) {
        case 'accepted':
          await db.run(
            `update outbox set status = 'synced', reason = null, attempts = 0,
                    next_attempt_at = null, updated_at = ? where seq = ?`,
            [at, row.seq],
          );
          break;
        case 'conflict':
        case 'rejected':
          await db.run(
            `update outbox set status = ?, reason = ?, next_attempt_at = null, updated_at = ?
              where seq = ?`,
            [result.verdict, result.reason, at, row.seq],
          );
          break;
        case 'retryable_error':
          await markFailed(db, row.seq, row.attempts, result.reason, now);
          break;
      }
    }
  });
}

/** A claimed record, by its key. */
export type OutboxKey = Pick<OutboxEntry, 'entity' | 'recordId'>;

/**
 * The push of `batch` failed (no network, a server error, an envelope error),
 * or the server did not answer some of it. Those rows, if still syncing, are
 * failed with a backoff, or pending again if dirty. Only this batch's rows are
 * touched: another run may have a batch in flight at the same time (#56).
 */
export async function releaseBatch(
  db: DeviceDb,
  batch: readonly OutboxKey[],
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  const at = now.toISOString();
  await db.transaction(async () => {
    const rows = await syncingRows(db, batch);
    for (const row of rows) {
      if (row.dirty === 1) {
        await requeue(db, row.seq, at);
      } else {
        await markFailed(db, row.seq, row.attempts, reason, now);
      }
    }
  });
}

/**
 * Hands `batch` back unsent and with no retry penalty: its rows, if still
 * syncing, are pending again. Used when the signed-in user changed after the
 * claim (ADR-020). Only this batch's rows are touched (#56).
 */
export async function returnBatch(db: DeviceDb, batch: readonly OutboxKey[], now: Date = new Date()): Promise<void> {
  const at = now.toISOString();
  await db.transaction(async () => {
    for (const row of await syncingRows(db, batch)) {
      await db.run(`update outbox set status = 'pending', dirty = 0, updated_at = ? where seq = ?`, [at, row.seq]);
    }
  });
}

/**
 * Run once on app start, before any sync run. A push the app was killed in
 * the middle of left its rows syncing; they are pending again. Sending them
 * twice is safe, because the server never duplicates a record (#33). Never
 * call it while a run may be in flight: it resets every syncing row.
 */
export async function recoverInterrupted(db: DeviceDb, now: Date = new Date()): Promise<number> {
  const { changes } = await db.run(
    `update outbox set status = 'pending', dirty = 0, updated_at = ? where status = 'syncing'`,
    [now.toISOString()],
  );
  return changes;
}

export async function getStatus(
  db: DeviceDb,
  entity: SyncEntity,
  recordId: string,
): Promise<OutboxRecordStatus | null> {
  const [row] = await db.all<OutboxRecordStatus>(
    `select status, reason from outbox where entity = ? and record_id = ?`,
    [entity, recordId.toLowerCase()],
  );
  return row ?? null;
}

/** Rows per status, for every user or, given an author, for that user only. */
export async function countByStatus(
  db: DeviceDb,
  authorId?: string,
): Promise<Record<OutboxStatus, number>> {
  const counts = Object.fromEntries(OUTBOX_STATUSES.map((s) => [s, 0])) as Record<OutboxStatus, number>;
  const rows =
    authorId === undefined
      ? await db.all<{ status: OutboxStatus; n: number }>(
          `select status, count(*) as n from outbox group by status`,
        )
      : await db.all<{ status: OutboxStatus; n: number }>(
          `select status, count(*) as n from outbox where author_id = ? group by status`,
          [authorId.toLowerCase()],
        );
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

/**
 * How many of this user's records the server has not accepted yet. Sign-out
 * uses it to warn, not to block: the rows stay and go out when they return.
 */
export async function countUnsent(db: DeviceDb, authorId: string): Promise<number> {
  const [row] = await db.all<{ n: number }>(
    `select count(*) as n from outbox where author_id = ? and status <> 'synced'`,
    [authorId.toLowerCase()],
  );
  return row?.n ?? 0;
}

/** A record the server refused or would not overwrite, for the phone to show (#68). */
export interface AttentionRow {
  entity: SyncEntity;
  recordId: string;
  status: 'conflict' | 'rejected';
  reason: string | null;
  updatedAt: string;
}

/**
 * Conflict and rejected records, newest first: this user's, or every user's
 * when no author is given. They are never retried by themselves (ADR-016).
 */
export async function listAttention(db: DeviceDb, authorId?: string, limit = 50): Promise<AttentionRow[]> {
  const rows = await db.all<{
    entity: SyncEntity;
    record_id: string;
    status: 'conflict' | 'rejected';
    reason: string | null;
    updated_at: string;
  }>(
    `select entity, record_id, status, reason, updated_at from outbox
      where status in ('conflict', 'rejected')
        and (? is null or author_id = ?)
      order by updated_at desc, seq desc
      limit ?`,
    [authorId?.toLowerCase() ?? null, authorId?.toLowerCase() ?? null, Math.max(1, limit)],
  );
  return rows.map((r) => ({
    entity: r.entity,
    recordId: r.record_id,
    status: r.status,
    reason: r.reason,
    updatedAt: r.updated_at,
  }));
}

/**
 * "Sync now": makes this user's failed records due at once instead of waiting
 * out their backoff (ADR-016's manual retry). Conflict and rejected records stay
 * as they are; only saving them again re-queues them. Returns how many changed.
 */
export async function retryFailedNow(db: DeviceDb, authorId?: string, now: Date = new Date()): Promise<number> {
  const { changes } = await db.run(
    `update outbox set next_attempt_at = null, updated_at = ?
      where status = 'failed' and (? is null or author_id = ?)`,
    [now.toISOString(), authorId?.toLowerCase() ?? null, authorId?.toLowerCase() ?? null],
  );
  return changes;
}

async function syncingRows(
  db: DeviceDb,
  batch: readonly OutboxKey[],
): Promise<{ seq: number; dirty: number; attempts: number }[]> {
  const rows: { seq: number; dirty: number; attempts: number }[] = [];
  for (const key of batch) {
    const [row] = await db.all<{ seq: number; dirty: number; attempts: number }>(
      `select seq, dirty, attempts from outbox
        where entity = ? and record_id = ? and status = 'syncing'`,
      [key.entity, key.recordId.toLowerCase()],
    );
    if (row) rows.push(row);
  }
  return rows;
}

async function requeue(db: DeviceDb, seq: number, at: string): Promise<void> {
  await db.run(
    `update outbox set status = 'pending', dirty = 0, reason = null, attempts = 0,
            next_attempt_at = null, updated_at = ? where seq = ?`,
    [at, seq],
  );
}

async function markFailed(
  db: DeviceDb,
  seq: number,
  attempts: number,
  reason: string | null,
  now: Date,
): Promise<void> {
  const next = attempts + 1;
  await db.run(
    `update outbox set status = 'failed', reason = ?, attempts = ?, next_attempt_at = ?,
            updated_at = ? where seq = ?`,
    [reason, next, new Date(now.getTime() + backoffMs(next)).toISOString(), now.toISOString(), seq],
  );
}

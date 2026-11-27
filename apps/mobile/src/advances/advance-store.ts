// Saves a worker advance on the phone and reads this user's advances back. Owner: Offline
// Sync (Nikhil). Issue #239, ADR-054, ADR-020.
//
// An advance is append-only, like the ledger it feeds: a mistake is cancelled by a second
// record that points at the first, never by an edit. Every save and read is under the
// signed-in user, so another user on a shared phone sees none of it. The list joins what this
// user saved here with the advances the pull mirror holds for the last two months (ADR-054).

import type { DeviceDb } from '../db/device-db';
import { enqueue, listRecords, newRecordId } from '../sync/outbox';
import type { OutboxStatus } from '../sync/entities';
import { istDate, readRosterOn, readSiteAdvances, readSiteWorkers } from '../sync/pull';
import { AdvanceError, buildAdvance, buildPayload, parsePayload, type AdvanceInput, type StoredAdvance } from './advance';

/** Records read back for one site. The outbox keeps synced rows, so this is a cap, not a filter. */
const READ_LIMIT = 500;

export type AdvanceDraft = Omit<AdvanceInput, 'paidOn'> & {
  /** An Asia/Kolkata day. Today on the phone when left out. */
  paidOn?: string;
};

/**
 * Validates an advance against what this phone holds, then queues it under the user.
 * Throws AdvanceError, writing nothing, for anything the rules refuse. The worker must be
 * on this site's roster on that day, as the server checks (ADR-021 D10).
 */
export async function saveAdvance(
  db: DeviceDb,
  userId: string,
  siteId: string,
  draft: AdvanceDraft,
  now: Date = new Date(),
): Promise<string> {
  const today = istDate(now.toISOString());
  const advance = buildAdvance({ ...draft, paidOn: draft.paidOn ?? today }, today);
  const rostered = await readRosterOn(db, userId, siteId, advance.paidOn);
  if (!rostered.some((w) => w.workerId === advance.workerId.toLowerCase())) throw new AdvanceError('worker_not_found');
  const recordId = newRecordId();
  await enqueue(
    db,
    { entity: 'worker_advances', recordId, authorId: userId, payload: buildPayload({ ...advance, siteId, reversesId: null }) },
    now,
  );
  return recordId;
}

export interface SiteAdvance extends StoredAdvance {
  recordId: string;
  status: OutboxStatus;
  reason: string | null;
  updatedAt: string;
  workerName: string;
  /** True once this user has saved a cancellation of it. */
  cancelled: boolean;
  /** Only an advance the server holds can be cancelled, once. */
  canCancel: boolean;
}

/**
 * The advances and cancellations at one site, newest day first: what this user saved here, plus
 * what the mirror holds that is not in the outbox. A row that is not an advance is skipped.
 */
export async function loadSiteAdvances(db: DeviceDb, userId: string, siteId: string): Promise<SiteAdvance[]> {
  const [rows, workers, mirrored] = await Promise.all([
    listRecords(db, userId, 'worker_advances', { siteId, limit: READ_LIMIT }),
    readSiteWorkers(db, userId, siteId),
    readSiteAdvances(db, userId, siteId),
  ]);
  const names = new Map(workers.map((w) => [w.workerId, w.name]));
  const parsed = rows.flatMap((row) => {
    const advance = parsePayload(row.payload);
    return advance === null ? [] : [{ recordId: row.recordId, status: row.status, reason: row.reason, updatedAt: row.updatedAt, advance }];
  });
  // The outbox keeps a synced row under the server's id, so the same advance is not shown twice.
  const saved = new Set(parsed.map((p) => p.recordId));
  const fromMirror = mirrored
    .filter((m) => !saved.has(m.id))
    .map((m) => ({
      recordId: m.id,
      status: 'synced' as const,
      reason: null,
      updatedAt: '',
      advance: { siteId: m.siteId, workerId: m.workerId, paidOn: m.paidOn, amountPaise: m.amountPaise, note: m.note, reversesId: m.reversesId },
    }));
  const all = [...parsed, ...fromMirror].sort((a, b) => b.advance.paidOn.localeCompare(a.advance.paidOn));
  // A rejected cancellation did not happen, so the advance can be cancelled again.
  const cancelledIds = new Set(
    all.filter((p) => p.advance.reversesId !== null && p.status !== 'rejected').map((p) => p.advance.reversesId),
  );
  return all.map(({ advance, ...row }): SiteAdvance => {
    const cancelled = cancelledIds.has(row.recordId);
    return {
      ...advance,
      ...row,
      workerName: names.get(advance.workerId.toLowerCase()) ?? '',
      cancelled,
      canCancel: advance.reversesId === null && row.status === 'synced' && !cancelled,
    };
  });
}

/**
 * Queues the cancellation of one of this user's advances that the server holds. It repeats
 * the worker, site, day and whole amount, as the server requires, so the month's total nets out.
 */
export async function reverseAdvance(
  db: DeviceDb,
  userId: string,
  siteId: string,
  advanceRecordId: string,
  now: Date = new Date(),
): Promise<string> {
  const target = (await loadSiteAdvances(db, userId, siteId)).find((a) => a.recordId === advanceRecordId.toLowerCase());
  if (!target || target.reversesId !== null || target.status !== 'synced') throw new AdvanceError('advance_not_found');
  if (target.cancelled) throw new AdvanceError('already_cancelled');
  const recordId = newRecordId();
  await enqueue(
    db,
    {
      entity: 'worker_advances',
      recordId,
      authorId: userId,
      payload: buildPayload({ ...target, note: null, reversesId: target.recordId }),
    },
    now,
  );
  return recordId;
}

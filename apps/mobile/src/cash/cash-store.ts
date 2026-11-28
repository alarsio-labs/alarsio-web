// Saves a site cash book entry on the phone and reads this user's cash book back. Owner: Offline
// Sync (Nikhil). Issue #258, ADR-058, ADR-020.
//
// An entry is append-only, like the ledger it feeds: a mistake is cancelled by a second record
// that points at the first, never by an edit. Every save and read is under the signed-in user, so
// another user on a shared phone sees none of it. The list joins what this user saved here with
// the entries the pull mirror holds for the last two months, and adds the advances paid at the
// site as read-only cash out, from the advances store.

import { loadSiteAdvances } from '../advances/advance-store';
import type { DeviceDb } from '../db/device-db';
import { enqueue, listRecords, newRecordId } from '../sync/outbox';
import { istDate, readSiteCashEntries } from '../sync/pull';
import {
  CashError,
  buildEntry,
  buildPayload,
  cashBalance,
  isWaiting,
  parsePayload,
  type CashBalance,
  type CashInput,
  type CashLine,
} from './cash';

/** Records read back for one site. The outbox keeps synced rows, so this is a cap, not a filter. */
const READ_LIMIT = 500;

export type CashDraft = Omit<CashInput, 'entryDate'> & {
  /** An Asia/Kolkata day. Today on the phone when left out. */
  entryDate?: string;
};

/** Validates an entry, then queues it under the user. Throws CashError, writing nothing, for anything the rules refuse. */
export async function saveEntry(
  db: DeviceDb,
  userId: string,
  siteId: string,
  draft: CashDraft,
  now: Date = new Date(),
): Promise<string> {
  const today = istDate(now.toISOString());
  const entry = buildEntry({ ...draft, entryDate: draft.entryDate ?? today }, today);
  const recordId = newRecordId();
  await enqueue(db, { entity: 'cash_entries', recordId, authorId: userId, payload: buildPayload({ ...entry, siteId, reversesId: null }) }, now);
  return recordId;
}

export interface SiteCash {
  /** Cash entries, their cancellations and the advances paid here, newest day first. */
  lines: CashLine[];
  /** The box for this month in India time. */
  balance: CashBalance;
  /** Lines the server has not confirmed yet. */
  waiting: number;
}

/**
 * The cash book of one site: what this user saved here, plus what the mirror holds that is not in
 * the outbox, plus the advances paid here. A row that is not an entry is skipped.
 */
export async function loadSiteCash(db: DeviceDb, userId: string, siteId: string, now: Date = new Date()): Promise<SiteCash> {
  const [rows, mirrored, advances] = await Promise.all([
    listRecords(db, userId, 'cash_entries', { siteId, limit: READ_LIMIT }),
    readSiteCashEntries(db, userId, siteId),
    loadSiteAdvances(db, userId, siteId),
  ]);
  const saved = rows.flatMap((row) => {
    const entry = parsePayload(row.payload);
    return entry === null ? [] : [{ recordId: row.recordId, status: row.status, reason: row.reason, entry }];
  });
  // The outbox keeps a synced row under the server's id, so the same entry is not shown twice.
  const known = new Set(saved.map((s) => s.recordId));
  const all = [
    ...saved,
    ...mirrored
      .filter((m) => !known.has(m.id))
      .map((m) => ({ recordId: m.id, status: 'synced' as const, reason: null, entry: m })),
  ];
  // A rejected cancellation did not happen, so the entry can be cancelled again.
  const cancelledIds = new Set(all.filter((s) => s.entry.reversesId !== null && s.status !== 'rejected').map((s) => s.entry.reversesId));
  const entryLines = all.map(({ entry, ...row }): CashLine => {
    const cancelled = cancelledIds.has(row.recordId);
    return {
      ...row,
      source: 'cash',
      entryDate: entry.entryDate,
      category: entry.category,
      amountPaise: entry.amountPaise,
      note: entry.note,
      reversesId: entry.reversesId,
      workerName: '',
      cancelled,
      canCancel: entry.reversesId === null && row.status === 'synced' && !cancelled,
    };
  });
  // The advance's own cancellation record is not a line: a cancelled advance shows struck out.
  const advanceLines = advances
    .filter((a) => a.reversesId === null)
    .map(
      (a): CashLine => ({
        recordId: a.recordId,
        source: 'advance',
        entryDate: a.paidOn,
        category: null,
        amountPaise: a.amountPaise,
        note: a.note,
        reversesId: null,
        status: a.status,
        reason: a.reason,
        workerName: a.workerName,
        cancelled: a.cancelled,
        canCancel: false,
      }),
    );
  const lines = [...entryLines, ...advanceLines].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  return {
    lines,
    balance: cashBalance(lines, istDate(now.toISOString()).slice(0, 7)),
    waiting: lines.filter(isWaiting).length,
  };
}

/**
 * Queues the cancellation of one of this user's entries that the server holds. It repeats the site,
 * day, category and whole amount, as the server requires, so the month's totals net out.
 */
export async function reverseEntry(
  db: DeviceDb,
  userId: string,
  siteId: string,
  entryRecordId: string,
  now: Date = new Date(),
): Promise<string> {
  const { lines } = await loadSiteCash(db, userId, siteId, now);
  const target = lines.find((l) => l.recordId === entryRecordId.toLowerCase() && l.source === 'cash');
  if (!target || target.category === null || target.reversesId !== null || target.status !== 'synced') {
    throw new CashError('entry_not_found');
  }
  if (target.cancelled) throw new CashError('already_cancelled');
  const recordId = newRecordId();
  await enqueue(
    db,
    {
      entity: 'cash_entries',
      recordId,
      authorId: userId,
      payload: buildPayload({
        siteId,
        entryDate: target.entryDate,
        category: target.category,
        amountPaise: target.amountPaise,
        note: null,
        reversesId: target.recordId,
      }),
    },
    now,
  );
  return recordId;
}

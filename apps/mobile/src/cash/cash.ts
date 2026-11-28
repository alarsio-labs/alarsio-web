// A site cash book entry as the phone holds it, and the payload sync_cash_entries accepts.
// Owner: Offline Sync (Nikhil). Issue #258, ADR-058. Server side: apply_cash_entry in
// 20261128150000_cash_entries.sql.
//
// Money is whole paise in an integer, never a float. Nothing here touches the database
// or the clock: callers pass the day in. The box balance is never stored; it is worked out
// from the lines each time.

import { AMOUNT_MAX_PAISE, NOTE_MAX, cleanNote, isCalendarDay, parseAmount, type AmountErrorCode } from '../advances/advance';
import i18n from '../i18n';
import type { OutboxStatus } from '../sync/entities';

const t = i18n.t.bind(i18n);

export const CASH_CATEGORIES = ['received', 'wages', 'material', 'transport', 'food', 'other'] as const;
export type CashCategory = (typeof CASH_CATEGORIES)[number];

export const isCashCategory = (value: unknown): value is CashCategory =>
  (CASH_CATEGORIES as readonly unknown[]).includes(value);

/** Only "received" puts money in the box; every other category takes it out. */
export const isCashIn = (category: CashCategory): boolean => category === 'received';

export type CashErrorCode =
  | AmountErrorCode
  | 'category_invalid'
  | 'note_too_long'
  | 'date_invalid'
  | 'date_future'
  | 'entry_not_found'
  | 'already_cancelled';

/** One fixed sentence per code, so a raw error never reaches the screen. */
export function cashErrorText(code: CashErrorCode): string {
  return t(`siteCash.error.${code}`, { max: NOTE_MAX });
}

export class CashError extends Error {
  constructor(readonly code: CashErrorCode) {
    super(code);
    this.name = 'CashError';
  }
}

export interface CashEntry {
  /** An Asia/Kolkata calendar day, YYYY-MM-DD. */
  entryDate: string;
  category: CashCategory;
  amountPaise: number;
  note: string | null;
}

export interface CashInput {
  category: string;
  amount: string;
  note: string;
  entryDate: string;
}

/** Validates one entry. `today` is the Asia/Kolkata day on the phone (ADR-021 D10). */
export function buildEntry(input: CashInput, today: string): CashEntry {
  if (!isCashCategory(input.category)) throw new CashError('category_invalid');
  const amount = parseAmount(input.amount);
  if (!amount.ok) throw new CashError(amount.code);
  if (!isCalendarDay(input.entryDate)) throw new CashError('date_invalid');
  if (input.entryDate > today) throw new CashError('date_future');
  const note = cleanNote(input.note);
  // Counted in characters, as the database counts them, not in UTF-16 units.
  if (note !== null && [...note].length > NOTE_MAX) throw new CashError('note_too_long');
  return { entryDate: input.entryDate, category: input.category, amountPaise: amount.paise, note };
}

export interface StoredCashEntry extends CashEntry {
  siteId: string;
  /** The entry this record cancels. Null for an entry. */
  reversesId: string | null;
}

export type CashPayload = {
  site_id: string;
  entry_date: string;
  category: CashCategory;
  amount_paise: number;
  note: string | null;
  reverses_id: string | null;
};

/** What sync_cash_entries reads. */
export function buildPayload(entry: StoredCashEntry): CashPayload {
  return {
    site_id: entry.siteId,
    entry_date: entry.entryDate,
    category: entry.category,
    amount_paise: entry.amountPaise,
    note: entry.note,
    reverses_id: entry.reversesId,
  };
}

const isId = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The entry an outbox payload holds, or null when it is not one. Never guesses. */
export function parsePayload(payload: Record<string, unknown>): StoredCashEntry | null {
  const { site_id: siteId, entry_date: entryDate, category, amount_paise: amountPaise, note, reverses_id: reversesId } = payload;
  if (!isId(siteId) || !isCashCategory(category)) return null;
  if (typeof entryDate !== 'string' || !isCalendarDay(entryDate)) return null;
  if (typeof amountPaise !== 'number' || !Number.isInteger(amountPaise)) return null;
  if (amountPaise <= 0 || amountPaise > AMOUNT_MAX_PAISE) return null;
  if (note !== null && note !== undefined && typeof note !== 'string') return null;
  if (reversesId !== null && reversesId !== undefined && !isId(reversesId)) return null;
  return { siteId, entryDate, category, amountPaise, note: note ?? null, reversesId: reversesId ?? null };
}

/** One row of the cash book: a cash entry, or an advance paid at the site (read-only cash out). */
export interface CashLine {
  recordId: string;
  source: 'cash' | 'advance';
  entryDate: string;
  /** An advance has none: the screen says "Advance". */
  category: CashCategory | null;
  amountPaise: number;
  note: string | null;
  /** The entry this line cancels. Always null for an advance line. */
  reversesId: string | null;
  status: OutboxStatus;
  reason: string | null;
  /** The worker an advance was paid to. Empty for a cash entry. */
  workerName: string;
  cancelled: boolean;
  /** Only a cash entry the server holds can be cancelled, once. */
  canCancel: boolean;
}

export interface CashBalance {
  inPaise: number;
  outPaise: number;
  advancesPaise: number;
  /** In, less out, less advances. Below zero is possible. */
  boxPaise: number;
}

/** A record the server refused is not in the books. */
const counts = (line: CashLine) => line.status !== 'rejected' && line.status !== 'conflict';

/** Records not yet confirmed by the server: they still count in the balance, but are not final (ADR-009). */
export const isWaiting = (line: CashLine) =>
  line.status === 'pending' || line.status === 'syncing' || line.status === 'failed';

/** The box for one month (YYYY-MM), from the lines the phone holds. A cancellation takes its entry back out. */
export function cashBalance(lines: readonly CashLine[], month: string): CashBalance {
  let inPaise = 0;
  let outPaise = 0;
  let advancesPaise = 0;
  for (const line of lines) {
    if (!line.entryDate.startsWith(month) || !counts(line)) continue;
    if (line.source === 'advance') {
      if (!line.cancelled) advancesPaise += line.amountPaise;
    } else if (line.category !== null) {
      const signed = line.reversesId === null ? line.amountPaise : -line.amountPaise;
      if (isCashIn(line.category)) inPaise += signed;
      else outPaise += signed;
    }
  }
  return { inPaise, outPaise, advancesPaise, boxPaise: inPaise - outPaise - advancesPaise };
}

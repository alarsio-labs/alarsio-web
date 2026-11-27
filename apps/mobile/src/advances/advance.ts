// A worker advance as the phone holds it, and the payload sync_worker_advances accepts.
// Owner: Offline Sync (Nikhil). Issue #239, ADR-054. Server side: apply_worker_advance in
// 20261127100000_worker_advances.sql.
//
// Money is whole paise in an integer, never a float. Nothing here touches the database
// or the clock: callers pass the day in.

import i18n from '../i18n';
import type { OutboxStatus } from '../sync/entities';
import { reasonText } from '../sync/status-text';

const t = i18n.t.bind(i18n);

/** The most characters the server keeps of a note (worker_advances.note). */
export const NOTE_MAX = 500;
/** The server's cap for one advance: ₹10,00,000. */
export const AMOUNT_MAX_PAISE = 100_000_000;

export type AdvanceErrorCode =
  | 'amount_required'
  | 'amount_invalid'
  | 'amount_zero'
  | 'amount_too_large'
  | 'note_too_long'
  | 'date_invalid'
  | 'date_future'
  | 'worker_not_found'
  | 'advance_not_found'
  | 'already_cancelled';

/** One fixed sentence per code, so a raw error never reaches the screen. */
export function advanceErrorText(code: AdvanceErrorCode): string {
  return t(`siteAdvances.error.${code}`, { max: NOTE_MAX });
}

export class AdvanceError extends Error {
  constructor(readonly code: AdvanceErrorCode) {
    super(code);
    this.name = 'AdvanceError';
  }
}

export interface Advance {
  workerId: string;
  /** An Asia/Kolkata calendar day, YYYY-MM-DD. */
  paidOn: string;
  amountPaise: number;
  note: string | null;
}

export interface AdvanceInput {
  workerId: string;
  amount: string;
  note: string;
  paidOn: string;
}

export type AmountResult = { ok: true; paise: number } | { ok: false; code: AdvanceErrorCode };

const RUPEES = /^(\d+)(?:\.(\d{1,2}))?$/;

/** Reads the rupees the supervisor typed into exact paise. */
export function parseAmount(text: string): AmountResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, code: 'amount_required' };
  const match = RUPEES.exec(trimmed);
  if (match === null) return { ok: false, code: 'amount_invalid' };
  const [, whole = '', fraction = ''] = match;
  if (whole.replace(/^0+(?=\d)/, '').length > 7) return { ok: false, code: 'amount_too_large' };
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (paise === 0) return { ok: false, code: 'amount_zero' };
  if (paise > AMOUNT_MAX_PAISE) return { ok: false, code: 'amount_too_large' };
  return { ok: true, paise };
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDay(text: string): boolean {
  const match = DAY.exec(text);
  if (match === null) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const cleanNote = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/** Validates one advance. `today` is the Asia/Kolkata day on the phone (ADR-021 D10). */
export function buildAdvance(input: AdvanceInput, today: string): Advance {
  const amount = parseAmount(input.amount);
  if (!amount.ok) throw new AdvanceError(amount.code);
  if (!isCalendarDay(input.paidOn)) throw new AdvanceError('date_invalid');
  if (input.paidOn > today) throw new AdvanceError('date_future');
  const note = cleanNote(input.note);
  // Counted in characters, as the database counts them, not in UTF-16 units.
  if (note !== null && [...note].length > NOTE_MAX) throw new AdvanceError('note_too_long');
  return { workerId: input.workerId, paidOn: input.paidOn, amountPaise: amount.paise, note };
}

export interface StoredAdvance extends Advance {
  siteId: string;
  /** The advance this record cancels. Null for an advance. */
  reversesId: string | null;
}

export type AdvancePayload = {
  site_id: string;
  worker_id: string;
  paid_on: string;
  amount_paise: number;
  note: string | null;
  reverses_id: string | null;
};

/** What sync_worker_advances reads. */
export function buildPayload(advance: StoredAdvance): AdvancePayload {
  return {
    site_id: advance.siteId,
    worker_id: advance.workerId,
    paid_on: advance.paidOn,
    amount_paise: advance.amountPaise,
    note: advance.note,
    reverses_id: advance.reversesId,
  };
}

const isId = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The advance an outbox payload holds, or null when it is not one. Never guesses. */
export function parsePayload(payload: Record<string, unknown>): StoredAdvance | null {
  const { site_id: siteId, worker_id: workerId, paid_on: paidOn, amount_paise: amountPaise, note, reverses_id: reversesId } = payload;
  if (!isId(siteId) || !isId(workerId)) return null;
  if (typeof paidOn !== 'string' || !isCalendarDay(paidOn)) return null;
  if (typeof amountPaise !== 'number' || !Number.isInteger(amountPaise)) return null;
  if (amountPaise <= 0 || amountPaise > AMOUNT_MAX_PAISE) return null;
  if (note !== null && note !== undefined && typeof note !== 'string') return null;
  if (reversesId !== null && reversesId !== undefined && !isId(reversesId)) return null;
  return { siteId, workerId, paidOn, amountPaise, note: note ?? null, reversesId: reversesId ?? null };
}

/** Rupees with Indian digit groups (12,34,567) and paise only when there are some. */
export function formatRupees(paise: number): string {
  const whole = String(Math.trunc(paise / 100));
  const grouped = whole.replace(/\B(?=(\d\d)*\d{3}(?!\d))/g, ',');
  const fraction = String(paise % 100).padStart(2, '0');
  return `₹${grouped}${fraction === '00' ? '' : `.${fraction}`}`;
}

export type AdvanceTone = 'wait' | 'ok' | 'attention';

/** What the screen says about one saved advance. "On the server" only once the server accepted it (ADR-009). */
export function advanceStatusText(status: OutboxStatus, reason: string | null): { tone: AdvanceTone; text: string } {
  switch (status) {
    case 'pending':
    case 'syncing':
      return { tone: 'wait', text: t('siteAdvances.status.waiting') };
    case 'failed':
      return { tone: 'wait', text: t('siteAdvances.status.failed') };
    case 'synced':
      return { tone: 'ok', text: t('siteAdvances.status.onServer') };
    case 'conflict':
    case 'rejected':
      return { tone: 'attention', text: t('siteAdvances.status.attention', { reason: reasonText(reason) }) };
  }
}

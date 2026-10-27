// A material movement as the phone holds it, and the payload sync_material_transactions
// accepts. Owner: Materials (Nikhil). Issue #82. Server side: ADR-015, the handler in
// 20261020100000_material_transactions.sql.
//
// Quantities are integer thousandths of the unit, never floats: numeric(12,3) on the
// server has three decimals, and 0.1 + 0.2 must not reach a ledger. Nothing here touches
// the database or the clock: callers pass the day in.

import type { MaterialKind } from './kinds';
import { MATERIAL_KINDS } from './kinds';
import type { OutboxStatus } from '../sync/entities';
import { reasonText } from '../sync/status-text';

export type { MaterialKind } from './kinds';

/** The most characters the server keeps of a reason (material_transactions.reason). */
export const REASON_MAX = 500;
/** numeric(12,3) holds 999,999,999.999, which is this many thousandths. */
const MILLI_MAX = 999_999_999_999;

export type MovementErrorCode =
  | 'quantity_required'
  | 'quantity_invalid'
  | 'quantity_zero'
  | 'quantity_negative'
  | 'quantity_too_large'
  | 'reason_required'
  | 'reason_too_long'
  | 'date_invalid'
  | 'date_future'
  | 'kind_invalid'
  | 'material_not_found';

/** One fixed sentence per code, so a raw error never reaches the screen. */
export const MOVEMENT_MESSAGES: Record<MovementErrorCode, string> = {
  quantity_required: 'Enter how much.',
  quantity_invalid: 'Enter the quantity as a number, with up to three decimals.',
  quantity_zero: 'The quantity cannot be zero.',
  quantity_negative: 'Only an adjustment can be negative.',
  quantity_too_large: 'That quantity is too large.',
  reason_required: 'An adjustment needs a reason.',
  reason_too_long: `Keep the reason within ${REASON_MAX} characters.`,
  date_invalid: 'Enter the date as YYYY-MM-DD.',
  date_future: 'The date cannot be in the future.',
  kind_invalid: 'Choose what kind of entry this is.',
  material_not_found: 'This material is not on this phone. Refresh and try again.',
};

export class MovementError extends Error {
  constructor(readonly code: MovementErrorCode) {
    super(code);
    this.name = 'MovementError';
  }
}

export interface Movement {
  materialId: string;
  kind: MaterialKind;
  /** Thousandths of the unit. Only an adjustment may be negative. */
  quantityMilli: number;
  /** An Asia/Kolkata calendar day, YYYY-MM-DD. */
  occurredOn: string;
  reason: string | null;
}

export interface MovementInput {
  materialId: string;
  kind: MaterialKind;
  quantity: string;
  reason: string;
  occurredOn: string;
}

export type QuantityResult = { ok: true; milli: number } | { ok: false; code: MovementErrorCode };

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d{1,3}))?$/;

/** Reads what the supervisor typed into exact thousandths. */
export function parseQuantity(text: string, kind: MaterialKind): QuantityResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, code: 'quantity_required' };
  const match = DECIMAL.exec(trimmed);
  if (match === null) return { ok: false, code: 'quantity_invalid' };
  const [, sign, whole, fraction = ''] = match as unknown as [string, string, string, string | undefined];
  if (whole.replace(/^0+(?=\d)/, '').length > 9) return { ok: false, code: 'quantity_too_large' };
  const magnitude = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  if (magnitude === 0) return { ok: false, code: 'quantity_zero' };
  if (sign === '-' && kind !== 'adjustment') return { ok: false, code: 'quantity_negative' };
  return { ok: true, milli: sign === '-' ? -magnitude : magnitude };
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDay(text: string): boolean {
  const match = DAY.exec(text);
  if (match === null) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const isKind = (value: unknown): value is MaterialKind =>
  typeof value === 'string' && (MATERIAL_KINDS as readonly string[]).includes(value);

/** Validates one entry. `today` is the Asia/Kolkata day on the phone (ADR-021 D10). */
export function buildMovement(input: MovementInput, today: string): Movement {
  if (!isKind(input.kind)) throw new MovementError('kind_invalid');
  const quantity = parseQuantity(input.quantity, input.kind);
  if (!quantity.ok) throw new MovementError(quantity.code);
  if (!isCalendarDay(input.occurredOn)) throw new MovementError('date_invalid');
  if (input.occurredOn > today) throw new MovementError('date_future');
  const reason = input.reason.trim() === '' ? null : input.reason.trim();
  // Counted in characters, as the database counts them, not in UTF-16 units.
  if (reason !== null && [...reason].length > REASON_MAX) throw new MovementError('reason_too_long');
  if (input.kind === 'adjustment' && reason === null) throw new MovementError('reason_required');
  return { materialId: input.materialId, kind: input.kind, quantityMilli: quantity.milli, occurredOn: input.occurredOn, reason };
}

export type MovementPayload = {
  material_id: string;
  kind: MaterialKind;
  quantity: number;
  occurred_on: string;
  reason?: string;
};

/** What sync_material_transactions reads. The quantity is a decimal number, as the handler casts it to numeric. */
export function buildPayload(movement: Movement): MovementPayload {
  const payload: MovementPayload = {
    material_id: movement.materialId,
    kind: movement.kind,
    quantity: movement.quantityMilli / 1000,
    occurred_on: movement.occurredOn,
  };
  if (movement.reason !== null) payload.reason = movement.reason;
  return payload;
}

/** The movement an outbox payload holds, or null when it is not one. Never guesses. */
export function parsePayload(payload: Record<string, unknown>): Movement | null {
  const { material_id: materialId, kind, quantity, occurred_on: occurredOn, reason } = payload;
  if (typeof materialId !== 'string' || materialId === '') return null;
  if (!isKind(kind)) return null;
  if (typeof quantity !== 'number') return null;
  if (typeof occurredOn !== 'string' || !isCalendarDay(occurredOn)) return null;
  if (reason !== undefined && typeof reason !== 'string') return null;
  // Through the same text rules as typing, so 12.3456 or 1e-7 is refused, not rounded.
  const parsed = parseQuantity(String(quantity), kind);
  if (!parsed.ok || Math.abs(parsed.milli) > MILLI_MAX) return null;
  const why = reason === undefined || reason.trim() === '' ? null : reason.trim();
  if (kind === 'adjustment' && why === null) return null;
  return { materialId, kind, quantityMilli: parsed.milli, occurredOn, reason: why };
}

/** How far a movement moves the balance: usage takes away, the rest add, an adjustment keeps its sign. */
export function signedMilli(movement: Movement): number {
  return movement.kind === 'usage' ? -movement.quantityMilli : movement.quantityMilli;
}

export type StockState = 'ok' | 'low' | 'negative';

/** Below zero, or at or under the threshold: the rule of the material_alerts view. A warning, never a refusal (ADR-015). */
export function stockState(milli: number, thresholdMilli: number | null): StockState {
  if (milli < 0) return 'negative';
  if (thresholdMilli !== null && milli <= thresholdMilli) return 'low';
  return 'ok';
}

/** Up to three decimals, trimmed, with thousands separators and a minus when negative. */
export function formatMilli(milli: number): string {
  const abs = Math.abs(milli);
  const whole = String(Math.trunc(abs / 1000)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = String(abs % 1000).padStart(3, '0').replace(/0+$/, '');
  const text = fraction === '' ? whole : `${whole}.${fraction}`;
  return milli < 0 ? `-${text}` : text;
}

export type MovementTone = 'wait' | 'ok' | 'attention';

/** What the screen says about one saved movement. "On the server" only once the server accepted it (ADR-009). */
export function movementStatusText(status: OutboxStatus, reason: string | null): { tone: MovementTone; text: string } {
  switch (status) {
    case 'pending':
    case 'syncing':
      return { tone: 'wait', text: 'Saved on this phone, waiting to send' };
    case 'failed':
      return { tone: 'wait', text: 'Could not send yet. Will retry.' };
    case 'synced':
      return { tone: 'ok', text: 'On the server' };
    case 'conflict':
    case 'rejected':
      return { tone: 'attention', text: `Needs attention · ${reasonText(reason)}` };
  }
}

import type { MessageCode } from "../messages";

// Checks what an accountant typed, to say what is wrong before the database
// does. The database is the boundary: wage_periods and wage_adjustments have
// CHECKs and an exclusion constraint for all of this, and RLS decides who may.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^-?\d{1,10}(\.\d{1,2})?$/;
const MAX_REASON = 500;

type Fail = { ok: false; code: MessageCode };

function parseDate(text: string): Date | null {
  if (!DATE.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  // new Date rolls 2026-02-31 over to March: compare to catch it.
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : d;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type PeriodInput = { period_type: "week" | "month"; start_date: string; end_date: string };

/** A week runs seven days from the date given; a month is the calendar month the date falls in. */
export function cleanPeriodInput(raw: { type: unknown; start: unknown }): { ok: true; value: PeriodInput } | Fail {
  if (raw.type !== "week" && raw.type !== "month") return { ok: false, code: "wage_period_invalid" };
  if (typeof raw.start !== "string") return { ok: false, code: "wage_period_invalid" };
  const start = parseDate(raw.start.trim());
  if (!start) return { ok: false, code: "wage_period_invalid" };

  if (raw.type === "week") {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { ok: true, value: { period_type: "week", start_date: iso(start), end_date: iso(end) } };
  }
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { ok: true, value: { period_type: "month", start_date: iso(first), end_date: iso(last) } };
}

export type AdjustmentInput = { amount: number; reason: string };

export function cleanAdjustmentInput(raw: { amount: unknown; reason: unknown }): { ok: true; value: AdjustmentInput } | Fail {
  if (typeof raw.amount !== "string" || !AMOUNT.test(raw.amount.trim())) return { ok: false, code: "wage_amount" };
  const amount = Number(raw.amount.trim());
  if (amount === 0) return { ok: false, code: "wage_amount" };
  if (typeof raw.reason !== "string") return { ok: false, code: "wage_reason" };
  const reason = raw.reason.trim();
  // Characters, not UTF-16 units: the database counts char_length.
  const length = Array.from(reason).length;
  if (length < 1 || length > MAX_REASON) return { ok: false, code: "wage_reason" };
  return { ok: true, value: { amount, reason } };
}

/** A reopen needs a reason too, checked the same way. */
export function cleanReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const reason = raw.trim();
  const length = Array.from(reason).length;
  return length >= 1 && length <= MAX_REASON ? reason : null;
}

/** The message for a database error code. Unknown codes read as the generic message. */
export function wageErrorCode(sqlstate: string | undefined): MessageCode {
  switch (sqlstate) {
    case "42501":
      return "wage_forbidden";
    case "23P01":
      return "wage_overlap";
    case "23514":
      return "wage_period_invalid";
    case "55000":
      return "wage_state";
    case "22023":
      return "wage_reason";
    case "23503":
      return "wage_no_line";
    default:
      return "generic";
  }
}

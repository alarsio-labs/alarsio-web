// Reads worker fields from a form. Shared by add and edit. Over-long input is
// refused, never cut short: a shortened code would be a different worker.

import type { MessageCode } from "@/lib/messages";

export { UUID } from "@/lib/uuid";

export const LIMITS = { code: 40, full_name: 120, trade: 60, phone: 20 } as const;
export const PAY_TYPES = ["daily", "hourly"] as const;
export type PayType = (typeof PAY_TYPES)[number];

/** Trimmed text, "" when absent, or null when longer than `max`. */
export function formText(form: FormData, name: string, max: number): string | null {
  const v = form.get(name);
  const text = typeof v === "string" ? v.trim() : "";
  return text.length > max ? null : text;
}

export type WorkerInput = { full_name: string; trade: string; pay_type: PayType; phone: string | null };

/** The editable worker fields, or null when any is missing, too long or not allowed. */
export function workerFields(form: FormData): WorkerInput | null {
  const full_name = formText(form, "full_name", LIMITS.full_name);
  const trade = formText(form, "trade", LIMITS.trade);
  const pay = formText(form, "pay_type", 10);
  const phone = formText(form, "phone", LIMITS.phone);
  if (!full_name || !trade || phone === null || !pay) return null;
  const pay_type = pay.toLowerCase();
  if (!(PAY_TYPES as readonly string[]).includes(pay_type)) return null;
  return { full_name, trade, pay_type: pay_type as PayType, phone: phone === "" ? null : phone };
}

/** Maps a PostgREST error code to one of our message codes. */
export function workerErrorCode(code: string | undefined): MessageCode {
  switch (code) {
    case "23505":
      return "worker_code_taken";
    case "23514":
    case "23502":
    case "22P02":
    case "22001":
      return "worker_invalid";
    case "42501":
      return "not_permitted";
    case "55000":
      return "pay_type_locked";
    default:
      return "generic";
  }
}

/** The highest daily or hourly rate the form accepts, in rupees. */
export const MAX_RATE = 100_000;

/** A rupee amount: digits with up to two decimals, above zero, at most MAX_RATE. */
export function parseRate(value: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  return n > 0 && n <= MAX_RATE ? n : null;
}

/** How far back and ahead a new rate may start, in days. */
export const RATE_BACKDATE_DAYS = 60;
export const RATE_AHEAD_DAYS = 365;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function rateDateWindow(today: string): { min: string; max: string } {
  return { min: addDays(today, -RATE_BACKDATE_DAYS), max: addDays(today, RATE_AHEAD_DAYS) };
}

/** A real calendar date (YYYY-MM-DD), optionally inside [min, max]. */
export function parseDate(value: string, window?: { min: string; max: string }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  if (window && (value < window.min || value > window.max)) return null;
  return value;
}

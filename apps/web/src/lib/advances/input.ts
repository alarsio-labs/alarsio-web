import type { MessageCode } from "../messages";

// Checks what was typed, to say what is wrong before the database does. The
// database is the boundary: apply_worker_advance holds every one of these rules.

const MAX_PAISE = 100_000_000;
const MAX_NOTE = 500;
// Plain digits only, so "1e3" and "0x10" never become a number.
const RUPEES = /^\d{1,7}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 86_400_000;

export type AdvanceInput = { paidOn: string; amountPaise: number; note: string | null };
type Fail = { ok: false; code: MessageCode };

/** Rupees as typed ("500", "500.5") to whole paise, or null if not a valid amount. */
function toPaise(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  if (!RUPEES.test(text)) return null;
  const [rupees, fraction = ""] = text.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return paise > 0 && paise <= MAX_PAISE ? paise : null;
}

/** A real calendar day, not later than tomorrow in UTC (the server's own limit). */
function cleanDay(v: unknown, now: Date): string | null {
  if (typeof v !== "string" || !DAY.test(v)) return null;
  const day = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== v) return null;
  const latest = new Date(now.getTime() + ONE_DAY_MS).toISOString().slice(0, 10);
  return v <= latest ? v : null;
}

/** Null for a blank note, a trimmed string for a valid one, undefined for a bad one. */
function cleanNote(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const note = v.trim();
  if (note === "") return null;
  // Characters, not UTF-16 units: the database counts char_length.
  return Array.from(note).length <= MAX_NOTE ? note : undefined;
}

export function cleanAdvanceInput(
  raw: { amount: unknown; paidOn: unknown; note: unknown },
  now: Date = new Date(),
): { ok: true; value: AdvanceInput } | Fail {
  const amountPaise = toPaise(raw.amount);
  if (amountPaise === null) return { ok: false, code: "advance_amount" };
  const paidOn = cleanDay(raw.paidOn, now);
  if (paidOn === null) return { ok: false, code: "advance_date" };
  const note = cleanNote(raw.note);
  if (note === undefined) return { ok: false, code: "advance_note" };
  return { ok: true, value: { amountPaise, paidOn, note } };
}

/** Only the answers a person can act on. Anything else is the generic message. */
export function advanceErrorCode(sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "advance_forbidden";
  if (sqlstate === "22023") return "advance_date";
  if (sqlstate === "23514") return "advance_rule";
  if (sqlstate === "23505") return "advance_exists";
  return "generic";
}

import type { MessageCode } from "../messages";
import { isMaterialUnit, type MaterialUnit } from "./units";

// Checks what a manager typed, to say what is wrong before the database does.
// The database is the boundary: materials has CHECKs on all of this, and RLS
// decides who may write. These make the message specific.

const MAX_NAME = 120;
// numeric(12,3): up to 9 digits before the point and 3 after. Plain digits only,
// so "1e3", "0x10" and "Infinity" never become a number.
const THRESHOLD = /^\d{1,9}(\.\d{1,3})?$/;

export type MaterialInput = { name: string; unit: MaterialUnit; threshold: number | null };
export type MaterialEdit = { name: string; threshold: number | null };

type Raw = { name: unknown; unit?: unknown; threshold: unknown };
type Fail = { ok: false; code: MessageCode };

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  // Characters, not UTF-16 units: the database counts char_length.
  const length = Array.from(name).length;
  return length >= 1 && length <= MAX_NAME ? name : null;
}

/** Null for a blank threshold (no alert), a number for a valid one, undefined for a bad one. */
function cleanThreshold(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t === "") return null;
  return THRESHOLD.test(t) ? Number(t) : undefined;
}

export function cleanMaterialInput(raw: Raw, opts: { unit: true }): { ok: true; value: MaterialInput } | Fail;
export function cleanMaterialInput(raw: Raw, opts: { unit: false }): { ok: true; value: MaterialEdit } | Fail;
export function cleanMaterialInput(
  raw: Raw,
  opts: { unit: boolean },
): { ok: true; value: MaterialInput | MaterialEdit } | Fail {
  const name = cleanName(raw.name);
  if (name === null) return { ok: false, code: "material_name" };
  // An edit never reads the unit: it is fixed once the material exists (ADR-015).
  if (opts.unit && !isMaterialUnit(raw.unit)) return { ok: false, code: "material_unit" };
  const threshold = cleanThreshold(raw.threshold);
  if (threshold === undefined) return { ok: false, code: "material_threshold" };
  return opts.unit
    ? { ok: true, value: { name, unit: raw.unit as MaterialUnit, threshold } }
    : { ok: true, value: { name, threshold } };
}

/** Only the answers a manager can act on. Anything else is the generic message. */
export function materialErrorCode(sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "material_forbidden";
  if (sqlstate === "23505") return "material_exists";
  return "generic";
}

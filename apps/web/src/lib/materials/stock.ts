// Narrowing for the rows PostgREST returns as unknown JSON, and how stock is
// shown. The database is the boundary; these only make the page's types honest.

type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

/** A number, or a numeric sent as a string. Never null, blank or anything else. */
function num(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export type BalanceRow = {
  material_id: string;
  site_id: string;
  name: string;
  unit: string;
  low_stock_threshold: number | null;
  balance: number;
  transaction_count: number;
  last_movement_on: string | null;
};

export type AlertRow = {
  material_id: string;
  site_id: string;
  name: string;
  unit: string;
  balance: number;
  low_stock_threshold: number | null;
  alert: "negative" | "low";
};

/** Rows the guards accept come back with their numerics as numbers. */
export function toBalanceRow(v: unknown): BalanceRow | null {
  if (!rec(v) || !str(v.material_id) || !str(v.site_id) || !str(v.name) || !str(v.unit) || !strOrNull(v.last_movement_on)) {
    return null;
  }
  const balance = num(v.balance);
  const count = num(v.transaction_count);
  const threshold = v.low_stock_threshold === null ? null : num(v.low_stock_threshold);
  if (balance === undefined || count === undefined || threshold === undefined) return null;
  return {
    material_id: v.material_id,
    site_id: v.site_id,
    name: v.name,
    unit: v.unit,
    low_stock_threshold: threshold,
    balance,
    transaction_count: count,
    last_movement_on: v.last_movement_on,
  };
}

export function toAlertRow(v: unknown): AlertRow | null {
  if (!rec(v) || !str(v.material_id) || !str(v.site_id) || !str(v.name) || !str(v.unit)) return null;
  if (v.alert !== "negative" && v.alert !== "low") return null;
  const balance = num(v.balance);
  const threshold = v.low_stock_threshold === null ? null : num(v.low_stock_threshold);
  if (balance === undefined || threshold === undefined) return null;
  return {
    material_id: v.material_id,
    site_id: v.site_id,
    name: v.name,
    unit: v.unit,
    balance,
    low_stock_threshold: threshold,
    alert: v.alert,
  };
}

export const isBalanceRow = (v: unknown): boolean => toBalanceRow(v) !== null;
export const isAlertRow = (v: unknown): boolean => toAlertRow(v) !== null;

const QTY = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

/** A quantity with up to three decimals, grouped the Indian way. */
export function formatQty(n: number): string {
  return QTY.format(n);
}

// Narrowing for the rows PostgREST returns as unknown JSON, and how money is
// shown. The database is the boundary; these only make the page's types honest.

type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const int = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

export type AdvanceRow = {
  id: string;
  worker_id: string;
  paid_on: string;
  amount_paise: number;
  note: string | null;
  reverses_id: string | null;
};
export type RosterRow = { worker_id: string; name: string; unassigned_at: string | null };
export type TotalRow = { worker_id: string; total_paise: number };

export const toAdvanceRow = (v: unknown): AdvanceRow | null =>
  rec(v) && str(v.id) && str(v.worker_id) && str(v.paid_on) && int(v.amount_paise) && strOrNull(v.note) && strOrNull(v.reverses_id)
    ? { id: v.id, worker_id: v.worker_id, paid_on: v.paid_on, amount_paise: v.amount_paise, note: v.note, reverses_id: v.reverses_id }
    : null;

export const toRosterRow = (v: unknown): RosterRow | null =>
  rec(v) && str(v.worker_id) && str(v.name) && strOrNull(v.unassigned_at)
    ? { worker_id: v.worker_id, name: v.name, unassigned_at: v.unassigned_at }
    : null;

export const toTotalRow = (v: unknown): TotalRow | null =>
  rec(v) && str(v.worker_id) && int(v.total_paise) ? { worker_id: v.worker_id, total_paise: v.total_paise } : null;

/** Whole paise as rupees in Indian grouping: 50000 is "₹500", 50050 is "₹500.50". */
export function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(paise / 100);
}

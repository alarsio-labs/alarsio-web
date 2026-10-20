import { BOM, csvCell } from "../export/csv";

// What the wage summary screen shows, and the single place its figures are
// turned into text. The screen, the CSV and the Excel file all read
// summaryTable(), so they cannot differ by a paisa (#61 AC 9, ADR-035).
// Amounts are added in whole paise, never as floating-point rupees.

type Rec = Record<string, unknown>;

export type SummaryRow = {
  worker_id: string;
  worker_code: string;
  worker_name: string | null;
  pay_type: "daily" | "hourly";
  payable_days: number;
  overtime_hours: number;
  rate_from: number | null;
  rate_to: number | null;
  pay_amount: number;
  overtime_amount: number;
  adjustments_amount: number;
  total_amount: number;
  no_rate_days: number;
};

function num(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : (num(v) ?? null);
}

/** A wage_summary row from PostgREST's unknown JSON, or null when it is not one. */
export function toSummaryRow(v: unknown): SummaryRow | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Rec;
  const payable = num(r.payable_days);
  const overtime = num(r.overtime_hours);
  const pay = num(r.pay_amount);
  const ot = num(r.overtime_amount);
  const adj = num(r.adjustments_amount);
  const total = num(r.total_amount);
  const noRate = num(r.no_rate_days);
  if (
    typeof r.worker_id !== "string" ||
    typeof r.worker_code !== "string" ||
    (r.pay_type !== "daily" && r.pay_type !== "hourly") ||
    payable === undefined || overtime === undefined || pay === undefined || ot === undefined ||
    adj === undefined || total === undefined || noRate === undefined
  ) {
    return null;
  }
  return {
    worker_id: r.worker_id,
    worker_code: r.worker_code,
    worker_name: typeof r.worker_name === "string" ? r.worker_name : null,
    pay_type: r.pay_type,
    payable_days: payable,
    overtime_hours: overtime,
    rate_from: numOrNull(r.rate_from),
    rate_to: numOrNull(r.rate_to),
    pay_amount: pay,
    overtime_amount: ot,
    adjustments_amount: adj,
    total_amount: total,
    no_rate_days: noRate
  };
}

/** Whole paise in a rupee amount. The database keeps two decimals, so this is exact. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** "3200.00", "-200.00", "0.00": always two decimals, no grouping, no symbol. */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatRupees(rupees: number): string {
  return formatPaise(toPaise(rupees));
}

/** Days and hours are kept to two decimals by the database. */
export function formatQuantity(n: number): string {
  return formatPaise(Math.round(n * 100));
}

export const SUMMARY_COLUMNS = [
  "Worker code",
  "Name",
  "Pay type",
  "Payable days",
  "Rate (from)",
  "Rate (to)",
  "Pay",
  "Overtime hours",
  "Overtime pay",
  "Adjustments",
  "Total",
  "Days with no rate"
] as const;

// Which of the columns above are numbers. The rest are text.
export const NUMERIC_COLUMNS: ReadonlySet<number> = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11]);

export type SummaryTable = {
  header: readonly string[];
  body: string[][];
  /** The totals row; text cells are empty except the first, which says "Total". */
  totals: string[];
};

export function summaryTable(rows: readonly SummaryRow[]): SummaryTable {
  const body = rows.map((r) => [
    r.worker_code,
    r.worker_name ?? "",
    r.pay_type,
    formatQuantity(r.payable_days),
    r.rate_from === null ? "" : formatRupees(r.rate_from),
    r.rate_to === null ? "" : formatRupees(r.rate_to),
    formatRupees(r.pay_amount),
    formatQuantity(r.overtime_hours),
    formatRupees(r.overtime_amount),
    formatRupees(r.adjustments_amount),
    formatRupees(r.total_amount),
    String(r.no_rate_days)
  ]);

  const sum = (pick: (r: SummaryRow) => number) => rows.reduce((s, r) => s + toPaise(pick(r)), 0);
  const totals = [
    "Total", "", "",
    formatPaise(sum((r) => r.payable_days)),
    "", "",
    formatPaise(sum((r) => r.pay_amount)),
    formatPaise(sum((r) => r.overtime_hours)),
    formatPaise(sum((r) => r.overtime_amount)),
    formatPaise(sum((r) => r.adjustments_amount)),
    formatPaise(sum((r) => r.total_amount)),
    String(rows.reduce((s, r) => s + r.no_rate_days, 0))
  ];
  return { header: SUMMARY_COLUMNS, body, totals };
}

const DECIMAL = /^-?\d+(\.\d{2})?$/;

function csvLine(cells: readonly string[]): string {
  return cells
    .map((text, i) => (NUMERIC_COLUMNS.has(i) && DECIMAL.test(text) ? text : csvCell(text)))
    .join(",");
}

/** The summary as CSV: RFC 4180, CRLF, a BOM, numbers written exactly as the screen shows them. */
export function summaryCsv(rows: readonly SummaryRow[]): string {
  const t = summaryTable(rows);
  const lines = [t.header.map(csvCell).join(","), ...t.body.map(csvLine), csvLine(t.totals)];
  return BOM + lines.join("\r\n") + "\r\n";
}

export function exportFileName(periodStart: string, periodEnd: string, ext: "csv" | "xlsx"): string {
  return `wages-${periodStart}-to-${periodEnd}.${ext}`;
}

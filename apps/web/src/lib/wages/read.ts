import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toSummaryRow, type SummaryRow } from "./summary";

// Reads for the wages pages and the export, always as the signed-in user: RLS
// (can_view_wages) decides what comes back, so a role that may not read wages
// gets no period and no rows.

export type Period = {
  id: string;
  org_id: string;
  period_type: "week" | "month";
  start_date: string;
  end_date: string;
  status: "draft" | "locked";
  calculated_at: string | null;
  locked_at: string | null;
};

function toPeriod(v: unknown): Period | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (
    typeof r.id !== "string" || typeof r.org_id !== "string" ||
    (r.period_type !== "week" && r.period_type !== "month") ||
    typeof r.start_date !== "string" || typeof r.end_date !== "string" ||
    (r.status !== "draft" && r.status !== "locked")
  ) {
    return null;
  }
  return {
    id: r.id,
    org_id: r.org_id,
    period_type: r.period_type,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    calculated_at: typeof r.calculated_at === "string" ? r.calculated_at : null,
    locked_at: typeof r.locked_at === "string" ? r.locked_at : null
  };
}

export async function readPeriod(supabase: SupabaseClient, periodId: string, orgId: string): Promise<Period | null> {
  const { data } = await supabase
    .from("wage_periods")
    .select("id, org_id, period_type, start_date, end_date, status, calculated_at, locked_at")
    .eq("id", periodId)
    .eq("org_id", orgId)
    .maybeSingle();
  return toPeriod(data);
}

/** The organisation's periods, newest first, for the list page. */
export async function readPeriods(supabase: SupabaseClient, orgId: string): Promise<Period[]> {
  const { data } = await supabase
    .from("wage_periods")
    .select("id, org_id, period_type, start_date, end_date, status, calculated_at, locked_at")
    .eq("org_id", orgId)
    .order("start_date", { ascending: false })
    .limit(200);
  return Array.isArray(data) ? data.map(toPeriod).filter((p): p is Period => p !== null) : [];
}

// 1000 is PostgREST's default row cap. An organisation has 2 to 20 sites; a period with
// more workers than this is read in pages of this size so the screen and the export
// never silently stop at the cap.
const PAGE = 1000;

export async function readSummaryRows(
  supabase: SupabaseClient,
  periodId: string
): Promise<{ rows: SummaryRow[]; dropped: number } | null> {
  const rows: SummaryRow[] = [];
  let dropped = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("wage_summary")
      .select(
        "worker_id, worker_code, worker_name, pay_type, payable_days, overtime_hours, rate_from, rate_to, " +
          "pay_amount, overtime_amount, adjustments_amount, total_amount, no_rate_days"
      )
      .eq("period_id", periodId)
      .order("worker_code")
      .order("worker_id")
      .range(from, from + PAGE - 1);
    if (error || !Array.isArray(data)) return null;
    for (const v of data as unknown[]) {
      const row = toSummaryRow(v);
      if (row) rows.push(row);
      else dropped += 1;
    }
    if (data.length < PAGE) break;
  }
  return { rows, dropped };
}

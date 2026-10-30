import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { Field, buttonClass, inputClass } from "@/components/form";
import { Button, buttonClasses } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { dayLabel } from "@/lib/app/dates";
import { readPeriod, readSummaryRows } from "@/lib/wages/read";
import { formatIst } from "@/lib/wages/time";
import { formatRupees, summaryTable, NUMERIC_COLUMNS } from "@/lib/wages/summary";
import { addAdjustment, calculatePeriod, lockPeriod, reopenPeriod } from "../actions";

type Change = {
  worker_id: string;
  work_date: string;
  change: string;
  snapshot_status: string | null;
  snapshot_overtime_hours: number | null;
  current_status: string | null;
  current_overtime_hours: number | null;
  amount_difference: number;
};

function toChange(v: unknown): Change | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const diff = typeof r.amount_difference === "string" ? Number(r.amount_difference) : r.amount_difference;
  if (typeof r.worker_id !== "string" || typeof r.work_date !== "string" || typeof r.change !== "string" || typeof diff !== "number") {
    return null;
  }
  const n = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" ? Number(x) : null);
  return {
    worker_id: r.worker_id,
    work_date: r.work_date,
    change: r.change,
    snapshot_status: typeof r.snapshot_status === "string" ? r.snapshot_status : null,
    snapshot_overtime_hours: n(r.snapshot_overtime_hours),
    current_status: typeof r.current_status === "string" ? r.current_status : null,
    current_overtime_hours: n(r.current_overtime_hours),
    amount_difference: diff
  };
}

export default async function WagePeriodPage({
  params,
  searchParams
}: {
  params: Promise<{ period: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { period: periodId } = await params;
  const query = await searchParams;
  const org = query.org;
  if (!UUID.test(periodId) || typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/wages/${periodId}?org=${org}`)}`);

  const [period, { data: canView }, { data: isOwner }] = await Promise.all([
    readPeriod(supabase, periodId, org),
    supabase.rpc("can_view_wages", { p_org_id: org }),
    supabase.rpc("is_org_owner", { p_org_id: org })
  ]);
  if (canView !== true) redirect("/dashboard");
  if (!period) redirect(`/wages?org=${org}&error=wage_not_found`);

  const locked = period.status === "locked";

  // The summary and, after a lock, where Attendance now differs from the snapshot
  // (ADR-032, ADR-035 D11) do not depend on each other, so they are read together.
  const [summary, changeResult] = await Promise.all([
    readSummaryRows(supabase, periodId),
    locked ? supabase.rpc("wage_period_attendance_changes", { p_period_id: periodId }) : Promise.resolve({ data: null })
  ]);
  const table = summary ? summaryTable(summary.rows) : null;
  // PostgREST stops a function that returns a set at 1000 rows without saying so.
  const changesMayBeCut = Array.isArray(changeResult.data) && changeResult.data.length >= 1000;
  const changes: Change[] = Array.isArray(changeResult.data)
    ? changeResult.data.map(toChange).filter((c): c is Change => c !== null)
    : [];
  const names = new Map((summary?.rows ?? []).map((r) => [r.worker_id, `${r.worker_code} ${r.worker_name ?? ""}`.trim()]));

  const error = messageFor(query.error);
  const saved = query.saved === "1";
  const noRate = (summary?.rows ?? []).filter((r) => r.no_rate_days > 0);
  const exportBase = `/wages/${periodId}/export?org=${org}`;

  const num = (i: number) => (NUMERIC_COLUMNS.has(i) ? "ax-num" : undefined);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <div>
        <Link href={`/wages?org=${org}`} className="app-back">← Wage periods</Link>
        <PageHead
          eyebrow={period.period_type === "month" ? "Monthly wage period" : "Weekly wage period"}
          title={`${dayLabel(period.start_date)} to ${dayLabel(period.end_date)}`}
        />
        <p className="at-meta">
          <StatusTag tone={locked ? "ink" : "muted"}>{locked ? "Locked" : "Draft"}</StatusTag>
          <span>
            Approved attendance only.{" "}
            {period.calculated_at ? `Calculated ${formatIst(period.calculated_at) ?? "at an unknown time"} IST.` : "Not calculated yet."}
          </span>
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {saved && !error && <Notice kind="info">Saved.</Notice>}
      {summary && summary.dropped > 0 && <Notice kind="error">Some rows could not be shown. Reload, and tell the team if this stays.</Notice>}
      {!summary && <Notice kind="error">The summary could not be read. Reload and try again.</Notice>}
      {noRate.length > 0 && (
        <Notice kind="error">
          No rate for payable days: {noRate.map((r) => r.worker_code).join(", ")}. A rate is added on the worker&apos;s page. The
          period cannot be locked until every payable day has one.
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!locked && (
          <form action={calculatePeriod}>
            <input type="hidden" name="org_id" value={org} />
            <input type="hidden" name="period_id" value={periodId} />
            <Button type="submit" variant="secondary">Calculate</Button>
          </form>
        )}
        {!locked && (
          <form action={lockPeriod}>
            <input type="hidden" name="org_id" value={org} />
            <input type="hidden" name="period_id" value={periodId} />
            <Button type="submit">Lock period</Button>
          </form>
        )}
        {/* File downloads, not pages: plain links, so nothing prefetches them. */}
        <a href={`${exportBase}&format=csv`} className={buttonClasses("secondary")}>Download CSV</a>
        <a href={`${exportBase}&format=xlsx`} className={buttonClasses("secondary")}>Download Excel</a>
      </div>

      <Card title="Summary" id="wg-summary">
        {!table || table.body.length === 0 ? (
          <p className="ax-empty">No lines yet. Press Calculate to read the approved days of this period.</p>
        ) : (
          <div className="ax-table-wrap">
            <table className="ax-table" style={{ minWidth: 896 }}>
              <caption className="sr-only">Wage summary for this period</caption>
              <thead>
                <tr>
                  {table.header.map((h, i) => <th key={h} scope="col" className={num(i)}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {table.body.map((cells, r) => (
                  <tr key={summary?.rows[r]?.worker_id ?? r}>
                    {cells.map((c, i) => {
                      const content =
                        i === 4 && c === "" && (summary?.rows[r]?.no_rate_days ?? 0) > 0 ? <StatusTag tone="action">No rate</StatusTag> : c;
                      return i === 0 ? (
                        <th key={i} scope="row" className={num(i)}>{content}</th>
                      ) : (
                        <td key={i} className={num(i)}>{content}</td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="font-semibold">
                  {table.totals.map((c, i) =>
                    i === 0 ? <th key={i} scope="row" className={num(i)}>{c}</th> : <td key={i} className={num(i)}>{c}</td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!locked && summary && summary.rows.length > 0 && (
        <Card title="Add an adjustment" id="wg-adjust">
          <p className="ax-empty">
            A paid leave day, an advance recovered, or a difference from a correction after a lock. It is a new row with a
            reason; it is never edited later.
          </p>
          <form action={addAdjustment} className="mt-3 max-w-lg space-y-4">
            <input type="hidden" name="org_id" value={org} />
            <input type="hidden" name="period_id" value={periodId} />
            <Field label="Worker">
              <select name="worker_id" required className={inputClass}>
                {summary.rows.map((r) => (
                  <option key={r.worker_id} value={r.worker_id}>{r.worker_code} {r.worker_name ?? ""}</option>
                ))}
              </select>
            </Field>
            <Field label="Amount in rupees (negative recovers)">
              <input name="amount" inputMode="decimal" required className={inputClass} />
            </Field>
            <Field label="Reason">
              <input name="reason" required maxLength={500} className={inputClass} />
            </Field>
            <button type="submit" className={buttonClass}>Add adjustment</button>
          </form>
        </Card>
      )}

      {locked && (
        <Card title="Attendance changed after the lock" id="wg-changes">
          {changesMayBeCut && (
            <div className="mb-3">
              <Notice kind="error">
                This list shows the first 1000 changes and may be incomplete. Ask the owner to reopen the period and recalculate it.
              </Notice>
            </div>
          )}
          {changes.length === 0 ? (
            <p className="ax-empty">Attendance still matches what this period was locked with.</p>
          ) : (
            <>
              <p className="ax-empty">
                A locked period never changes by itself. Pay a difference as an adjustment in the next open period, or ask the
                owner to reopen this one.
              </p>
              <ul className="ov-todo mt-3">
                {changes.map((c) => (
                  <li key={`${c.worker_id}-${c.work_date}-${c.change}`}>
                    <span>
                      {names.get(c.worker_id) ?? "Worker"} · {dayLabel(c.work_date)} ·{" "}
                      {c.change === "approved_after_lock" ? "approved after the lock" : "corrected"}
                    </span>
                    <span className="tabular-nums">
                      {c.snapshot_status ?? "none"} {c.snapshot_overtime_hours ?? ""} → {c.current_status ?? "none"}{" "}
                      {c.current_overtime_hours ?? ""} · {formatRupees(c.amount_difference)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {locked && isOwner === true && (
        <Card title="Reopen this period" id="wg-reopen">
          <p className="ax-empty">Only the owner can reopen a locked period. The reason is kept.</p>
          <form action={reopenPeriod} className="mt-3 max-w-lg space-y-4">
            <input type="hidden" name="org_id" value={org} />
            <input type="hidden" name="period_id" value={periodId} />
            <Field label="Reason">
              <input name="reason" required maxLength={500} className={inputClass} />
            </Field>
            <button type="submit" className={buttonClass}>Reopen period</button>
          </form>
        </Card>
      )}
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { Field, Notice, buttonClass, inputClass } from "@/components/form";
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/wages?org=${org}`} className="app-back">← Wage periods</Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {period.start_date} to {period.end_date}{" "}
        <span className="ml-2 rounded bg-neutral-200 px-2 py-0.5 text-sm font-medium text-neutral-800">
          {locked ? "Locked" : "Draft"}
        </span>
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Approved attendance only. {period.calculated_at ? `Calculated ${formatIst(period.calculated_at) ?? "at an unknown time"} IST.` : "Not calculated yet."}
      </p>

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}
      {saved && !error && <div className="mt-6"><Notice kind="info">Saved.</Notice></div>}
      {summary && summary.dropped > 0 && (
        <div className="mt-6">
          <Notice kind="error">Some rows could not be shown. Reload, and tell the team if this stays.</Notice>
        </div>
      )}
      {!summary && <div className="mt-6"><Notice kind="error">The summary could not be read. Reload and try again.</Notice></div>}
      {noRate.length > 0 && (
        <div className="mt-6">
          <Notice kind="error">
            No rate for payable days: {noRate.map((r) => r.worker_code).join(", ")}. A rate is added on the worker&apos;s page. The
            period cannot be locked until every payable day has one.
          </Notice>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!locked && (
          <form action={calculatePeriod}>
            <input type="hidden" name="org_id" value={org} />
            <input type="hidden" name="period_id" value={periodId} />
            <button type="submit" className="rounded-md border border-neutral-900 px-4 py-2 font-medium hover:bg-neutral-100">
              Calculate
            </button>
          </form>
        )}
        {!locked && (
          <form action={lockPeriod}>
            <input type="hidden" name="org_id" value={org} />
            <input type="hidden" name="period_id" value={periodId} />
            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700">
              Lock period
            </button>
          </form>
        )}
        <a href={`${exportBase}&format=csv`} className="text-sm underline">Download CSV</a>
        <a href={`${exportBase}&format=xlsx`} className="text-sm underline">Download Excel</a>
      </div>

      <section className="mt-8 overflow-x-auto">
        {!table || table.body.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No lines yet. Press Calculate to read the approved days of this period.
          </p>
        ) : (
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                {table.header.map((h, i) => (
                  <th key={h} className={`px-2 py-2 font-medium ${NUMERIC_COLUMNS.has(i) ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.body.map((cells, r) => (
                <tr key={summary?.rows[r]?.worker_id ?? r} className="border-b border-neutral-200">
                  {cells.map((c, i) => (
                    <td key={i} className={`px-2 py-2 ${NUMERIC_COLUMNS.has(i) ? "text-right tabular-nums" : ""}`}>
                      {i === 4 && c === "" && (summary?.rows[r]?.no_rate_days ?? 0) > 0 ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">no rate</span>
                      ) : (
                        c
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                {table.totals.map((c, i) => (
                  <td key={i} className={`px-2 py-2 ${NUMERIC_COLUMNS.has(i) ? "text-right tabular-nums" : ""}`}>{c}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {!locked && summary && summary.rows.length > 0 && (
        <section className="mt-10 max-w-lg">
          <h2 className="text-lg font-medium">Add an adjustment</h2>
          <p className="mt-1 text-sm text-neutral-600">
            A paid leave day, an advance recovered, or a difference from a correction after a lock. It is a new row with a
            reason; it is never edited later.
          </p>
          <form action={addAdjustment} className="mt-3 space-y-4">
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
        </section>
      )}

      {locked && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Attendance changed after the lock</h2>
          {changesMayBeCut && (
            <div className="mt-3">
              <Notice kind="error">
                This list shows the first 1000 changes and may be incomplete. Ask the owner to reopen the period and recalculate it.
              </Notice>
            </div>
          )}
          {changes.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600">Attendance still matches what this period was locked with.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-neutral-600">
                A locked period never changes by itself. Pay a difference as an adjustment in the next open period, or ask the
                owner to reopen this one.
              </p>
              <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
                {changes.map((c) => (
                  <li key={`${c.worker_id}-${c.work_date}-${c.change}`} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                    <span>
                      {names.get(c.worker_id) ?? "Worker"} · {c.work_date} ·{" "}
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
        </section>
      )}

      {locked && isOwner === true && (
        <section className="mt-10 max-w-lg">
          <h2 className="text-lg font-medium">Reopen this period</h2>
          <p className="mt-1 text-sm text-neutral-600">Only the owner can reopen a locked period. The reason is kept.</p>
          <form action={reopenPeriod} className="mt-3 space-y-4">
            <input type="hidden" name="org_id" value={org} />
            <input type="hidden" name="period_id" value={periodId} />
            <Field label="Reason">
              <input name="reason" required maxLength={500} className={inputClass} />
            </Field>
            <button type="submit" className={buttonClass}>Reopen period</button>
          </form>
        </section>
      )}
    </main>
  );
}

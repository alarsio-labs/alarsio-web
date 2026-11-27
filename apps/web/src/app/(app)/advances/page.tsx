import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { buttonClass, inputClass } from "@/components/form";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { isSiteRow, rows } from "@/lib/reports/rows";
import { formatDay, todayInIndia } from "@/lib/dates";
import {
  formatRupees,
  toAdvanceRow,
  toRosterRow,
  toTotalRow,
  type AdvanceRow,
  type RosterRow,
  type TotalRow
} from "@/lib/advances/rows";
import { cancelAdvance, recordAdvance } from "./actions";

const LIMIT = 500;

function many<T>(data: unknown, convert: (v: unknown) => T | null): { items: T[]; dropped: number } {
  if (!Array.isArray(data)) return { items: [], dropped: 0 };
  const items = data.map(convert).filter((v): v is T => v !== null);
  return { items, dropped: data.length - items.length };
}

export const metadata = { title: "Advances" };

export default async function AdvancesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const org = params.org;
  if (typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");
  const siteParam = typeof params.site === "string" && UUID.test(params.site) ? params.site : null;

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await getAuthUser();
  if (!user) {
    const next = `/advances?org=${org}${siteParam ? `&site=${siteParam}` : ""}`;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  // RLS decides who sees what; these checks only send everyone else away.
  const month = `${todayInIndia().slice(0, 7)}-01`;
  const [{ data: orgRow }, { data: siteData }, { data: canViewWages }, { data: canRecord }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.from("site_directory").select("id, name, status").eq("org_id", org).order("name"),
    supabase.rpc("can_view_wages", { p_org_id: org }),
    siteParam ? supabase.rpc("can_record_on_site", { p_site_id: siteParam }) : Promise.resolve({ data: false })
  ]);
  if (!orgRow) redirect("/dashboard");

  const sites = rows(siteData, isSiteRow);
  const site = siteParam ? sites.find((s) => s.id === siteParam) : undefined;
  if (siteParam && (!site || (canViewWages !== true && canRecord !== true))) redirect(`/advances?org=${org}`);

  const [{ data: advanceData }, { data: rosterData }, { data: totalData }] = site
    ? await Promise.all([
        supabase
          .from("worker_advances")
          .select("id, worker_id, paid_on, amount_paise, note, reverses_id")
          .eq("site_id", site.id)
          .order("paid_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(LIMIT),
        supabase.from("worker_roster").select("worker_id, name, unassigned_at").eq("org_id", org).eq("site_id", site.id),
        supabase.from("worker_advance_totals").select("worker_id, total_paise").eq("org_id", org).eq("month", month)
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const advances = many<AdvanceRow>(advanceData, toAdvanceRow);
  const roster = many<RosterRow>(rosterData, toRosterRow);
  const totals = many<TotalRow>(totalData, toTotalRow);
  const workerName = new Map(roster.items.map((r) => [r.worker_id, r.name]));
  // Only workers still on the site can be given a new advance.
  const current = roster.items.filter((r) => r.unassigned_at === null);
  // An advance is cancelled once, so a row another row points at has no Cancel button.
  const cancelled = new Set(advances.items.flatMap((a) => (a.reverses_id ? [a.reverses_id] : [])));
  const monthTotals = totals.items.filter((t) => workerName.has(t.worker_id) && t.total_paise !== 0);
  const error = messageFor(params.error);
  const saved = params.saved === "1";
  const today = todayInIndia();

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <div>
        {site && <Link href={`/advances?org=${org}`} className="app-back">← All sites</Link>}
        <PageHead eyebrow={site ? `Advances · ${orgRow.name}` : orgRow.name} title={site ? site.name : "Advances"} />
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {saved && !error && <Notice kind="info">Saved.</Notice>}
      {(advances.dropped > 0 || roster.dropped > 0 || totals.dropped > 0) && (
        <Notice kind="error">Some rows could not be shown. Reload, and tell the team if this stays.</Notice>
      )}

      {!site ? (
        <Card title="Sites" id="ad-sites">
          <DataTable
            caption="Sites"
            rows={sites}
            rowKey={(s) => s.id}
            minWidth={360}
            empty="No sites yet."
            columns={[
              { key: "name", label: "Site", render: (s) => <Link href={`/advances?org=${org}&site=${s.id}`} className="underline">{s.name}</Link> },
              { key: "status", label: "Status", render: (s) => <StatusTag tone={s.status === "active" || s.status === "completed" ? "ink" : "muted"}>{s.status}</StatusTag> }
            ]}
          />
        </Card>
      ) : (
        <>
          <Card title="Record an advance" id="ad-add">
            {current.length === 0 ? (
              <p className="ax-empty">No workers are on this site yet.</p>
            ) : (
              <form action={recordAdvance} className="grid max-w-md gap-3">
                <input type="hidden" name="org_id" value={org} />
                <input type="hidden" name="site_id" value={site.id} />
                {/* One id per form: sending it twice records one advance, not two. */}
                <input type="hidden" name="advance_id" value={crypto.randomUUID()} />
                <label className="au-field-row">
                  <span className="ax-eyebrow">Worker</span>
                  <select name="worker_id" required defaultValue="" className={inputClass}>
                    <option value="" disabled>Choose a worker</option>
                    {current.map((w) => <option key={w.worker_id} value={w.worker_id}>{w.name}</option>)}
                  </select>
                </label>
                <label className="au-field-row">
                  <span className="ax-eyebrow">Amount (₹)</span>
                  <input name="amount" required inputMode="decimal" placeholder="500" className={inputClass} />
                </label>
                <label className="au-field-row">
                  <span className="ax-eyebrow">Paid on</span>
                  <input name="paid_on" type="date" required defaultValue={today} max={today} className={inputClass} />
                </label>
                <label className="au-field-row">
                  <span className="ax-eyebrow">Note (optional)</span>
                  <input name="note" maxLength={500} className={inputClass} />
                </label>
                <button type="submit" className={buttonClass}>Record advance</button>
              </form>
            )}
          </Card>

          <Card title="This month, all sites" id="ad-totals">
            <DataTable<TotalRow>
              caption="Advances paid this month, by worker, at all sites"
              rows={monthTotals}
              rowKey={(t) => t.worker_id}
              minWidth={320}
              empty="No advances this month."
              columns={[
                { key: "worker", label: "Worker", render: (t) => workerName.get(t.worker_id) ?? "Worker" },
                { key: "total", label: "Total", numeric: true, render: (t) => formatRupees(t.total_paise) }
              ]}
            />
          </Card>

          <Card title={`Advances (${advances.items.length})`} id="ad-list">
            <p className="ax-empty mb-3">
              An advance is never edited or deleted. To fix a mistake, cancel it and record it again.
            </p>
            <DataTable<AdvanceRow>
              caption="Advances at this site"
              rows={advances.items}
              rowKey={(a) => a.id}
              minWidth={720}
              empty="No advances at this site yet."
              columns={[
                { key: "date", label: "Paid on", render: (a) => formatDay(a.paid_on) },
                { key: "worker", label: "Worker", render: (a) => workerName.get(a.worker_id) ?? "Worker" },
                { key: "amount", label: "Amount", numeric: true, render: (a) => formatRupees(a.reverses_id ? -a.amount_paise : a.amount_paise) },
                { key: "note", label: "Note", render: (a) => a.note ?? "" },
                {
                  key: "state",
                  label: "State",
                  render: (a) =>
                    a.reverses_id ? <StatusTag tone="muted">Cancellation</StatusTag> : cancelled.has(a.id) ? <StatusTag tone="muted">Cancelled</StatusTag> : null
                },
                {
                  key: "cancel",
                  label: "Cancel",
                  render: (a) =>
                    a.reverses_id || cancelled.has(a.id) ? null : (
                      <form action={cancelAdvance}>
                        <input type="hidden" name="org_id" value={org} />
                        <input type="hidden" name="site_id" value={site.id} />
                        <input type="hidden" name="advance_id" value={a.id} />
                        <input type="hidden" name="reversal_id" value={crypto.randomUUID()} />
                        <button type="submit" className="ax-btn ax-btn-secondary ax-btn-sm">Cancel</button>
                      </form>
                    )
                }
              ]}
            />
            {advances.items.length >= LIMIT && <p className="mt-2 ax-empty">Showing the latest {LIMIT} advances.</p>}
          </Card>
        </>
      )}
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { parseReportFilters } from "@/lib/reports/filters";
import { sortReports } from "@/lib/reports/order";
import { UUID, isReportStatusRow, isSiteRow, rows } from "@/lib/reports/rows";
import { reportTag } from "@/lib/reports/screen";
import { dayLabel } from "@/lib/app/dates";
import { inputClass } from "@/components/form";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";

const LIMIT = 200;

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const org = params.org;
  if (typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/reports?org=${org}`)}`);

  const f = parseReportFilters(params, new Date());

  // Everything below runs as the signed-in user. RLS shows a supervisor only
  // their sites, never a draft, and nothing from another organisation.
  let query = supabase
    .from("daily_report_status")
    .select("id, site_id, report_date, author_id, status, headcount, serious_blocker, safety_incident, flagged, photo_count")
    .eq("org_id", org)
    .gte("report_date", f.from)
    .lte("report_date", f.to)
    .order("report_date", { ascending: false })
    .limit(LIMIT);
  if (f.site) query = query.eq("site_id", f.site);
  if (f.status !== "all") query = query.eq("status", f.status);
  if (f.flaggedOnly) query = query.eq("flagged", true);

  // Membership through Identity's published predicate, not its tables.
  const [{ data: isMember }, { data: canManage }, { data: siteData }, { data: reportData }] = await Promise.all([
    supabase.rpc("is_org_member", { p_org_id: org }),
    // A member who cannot manage sites here is a supervisor (an accountant has no Reports
    // tab): their home is this page, and capture is on the phone (DESIGN.md section 4).
    supabase.rpc("can_manage_sites", { p_org_id: org }),
    supabase.from("site_directory").select("id, name, status").eq("org_id", org).order("name"),
    query
  ]);
  if (isMember !== true) redirect("/dashboard");

  const sites = rows(siteData, isSiteRow);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const reports = sortReports(rows(reportData, isReportStatusRow));

  type Report = (typeof reports)[number];

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead eyebrow={`${dayLabel(f.from)} to ${dayLabel(f.to)} · Asia/Kolkata`} title="Daily reports" />
      {canManage === false && (
        <Notice kind="info">Daily reports are filed from the Alarsio phone app. Here you can read yours and see what a manager said.</Notice>
      )}

      <form method="get" className="at-filters">
        <input type="hidden" name="org" value={org} />
        <label className="au-field-row">
          <span className="ax-eyebrow">Site</span>
          <select name="site" defaultValue={f.site ?? ""} className={inputClass}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="au-field-row">
          <span className="ax-eyebrow">Status</span>
          <select name="status" defaultValue={f.status} className={inputClass}>
            <option value="all">All</option>
            <option value="submitted">Not reviewed</option>
            <option value="rejected">Sent back</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </label>
        <label className="au-field-row">
          <span className="ax-eyebrow">From</span>
          <input type="date" name="from" defaultValue={f.from} className={inputClass} />
        </label>
        <label className="au-field-row">
          <span className="ax-eyebrow">To</span>
          <input type="date" name="to" defaultValue={f.to} className={inputClass} />
        </label>
        <label>
          <input type="checkbox" name="flagged" value="1" defaultChecked={f.flaggedOnly} /> Flagged only
        </label>
        <button type="submit" className="ax-btn ax-btn-secondary">Filter</button>
      </form>
      <p className="ax-empty">Up to 31 days at a time.</p>

      <Card title="Reports" id="rp-list">
        <DataTable<Report>
          caption="Daily reports"
          rows={reports}
          rowKey={(r) => r.id}
          minWidth={760}
          empty="No reports match."
          columns={[
            { key: "site", label: "Site", render: (r) => <Link href={`/reports/${r.id}?org=${org}`} className="underline">{siteName.get(r.site_id) ?? "Site"}</Link> },
            { key: "date", label: "Date", render: (r) => dayLabel(r.report_date) },
            { key: "headcount", label: "Headcount", numeric: true, render: (r) => r.headcount ?? "—" },
            { key: "photos", label: "Photos", numeric: true, render: (r) => r.photo_count },
            {
              key: "status",
              label: "Status",
              render: (r) => {
                const t = reportTag(r.status);
                return (
                  <span className="ov-tags">
                    <StatusTag tone={t.tone}>{t.word}</StatusTag>
                    {r.serious_blocker && <StatusTag tone="action">Serious blocker</StatusTag>}
                    {r.safety_incident && <StatusTag tone="action">Safety incident</StatusTag>}
                  </span>
                );
              }
            }
          ]}
        />
      </Card>
      {reports.length === LIMIT && <p className="ax-empty">Showing the first {LIMIT}. Narrow the filters to see the rest.</p>}
    </main>
  );
}

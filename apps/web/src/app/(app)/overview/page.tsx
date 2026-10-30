import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { isSiteRow } from "@/lib/reports/rows";
import { parseOverviewParams } from "@/lib/overview/params";
import { isAlertRow, isApprovedDayRow, isOverviewExceptionRow, isOverviewReportRow, strictRows } from "@/lib/overview/rows";
import { buildBoard, sortBoard, type BoardRow } from "@/lib/overview/board";
import { DAY_WORD, eyebrowFor, needsYou, overviewStats, reportWord } from "@/lib/overview/screen";
import { inputClass } from "@/components/form";
import { ButtonLink } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatCard } from "@/components/app/stat-card";
import { StatusTag } from "@/components/app/status-tag";

// One day of 20 sites is 20 reports and a few exceptions; approved days are one row
// per worker, so their cap is the one a large roster could reach. Each read is
// ordered, and a hit cap is said on the page rather than read as "not recorded".
const SITE_LIMIT = 500;
const REPORT_LIMIT = 500;
const EXCEPTION_LIMIT = 1000;
const APPROVED_LIMIT = 5000;
const ALERT_LIMIT = 1000;

export default async function OverviewPage({
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
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/overview?org=${org}`)}`);

  const { date } = parseOverviewParams(params, new Date());

  // Everything below runs as the signed-in user, and only through published views
  // (ADR-041): RLS shows an owner or project manager every site of the organisation,
  // a supervisor only theirs, an accountant no site, and nothing of another organisation.
  const [{ data: isMember }, { data: isOwner }, siteRes, reportRes, exceptionRes, approvedRes, alertRes] = await Promise.all([
    supabase.rpc("is_org_member", { p_org_id: org }),
    // Only the owner may export (export_org_data checks again); this only draws the button.
    supabase.rpc("is_org_owner", { p_org_id: org }),
    supabase.from("site_directory").select("id, name, status").eq("org_id", org).order("name").order("id").limit(SITE_LIMIT),
    supabase
      .from("daily_report_status")
      .select("id, site_id, status, headcount, serious_blocker, safety_incident, flagged")
      .eq("org_id", org)
      .eq("report_date", date)
      .order("site_id")
      .limit(REPORT_LIMIT),
    supabase
      .from("site_exceptions")
      .select("site_id, kind")
      .eq("org_id", org)
      .eq("exception_date", date)
      .order("site_id")
      .order("source_id")
      .limit(EXCEPTION_LIMIT),
    supabase
      .from("approved_attendance_days")
      .select("site_id")
      .eq("org_id", org)
      .eq("work_date", date)
      .order("site_id")
      .limit(APPROVED_LIMIT),
    supabase.from("material_alerts").select("site_id, material_id, alert").eq("org_id", org).order("site_id").limit(ALERT_LIMIT)
  ]);
  if (isMember !== true) redirect("/dashboard");

  // A failed read is not an empty one, and a row the page cannot read is not a
  // missing one: show nothing but the error, never a board where either would read
  // as "not filed" or "no attendance" (ADR-041 D8, ADR-043 D4).
  const read = {
    sites: strictRows(siteRes.data, isSiteRow),
    reports: strictRows(reportRes.data, isOverviewReportRow),
    exceptions: strictRows(exceptionRes.data, isOverviewExceptionRow),
    approvedDays: strictRows(approvedRes.data, isApprovedDayRow),
    alerts: strictRows(alertRes.data, isAlertRow)
  };
  const failed =
    [siteRes, reportRes, exceptionRes, approvedRes, alertRes].some((r) => r.error) ||
    Object.values(read).some((r) => r === null);
  const sites = read.sites ?? [];
  const reports = read.reports ?? [];
  const exceptions = read.exceptions ?? [];
  const approvedDays = read.approvedDays ?? [];
  const alerts = read.alerts ?? [];
  const board = sortBoard(buildBoard({ sites, reports, exceptions, approvedDays, alerts }));
  const stats = overviewStats(board);
  const todo = needsYou(board, org, date);
  const capped = [
    sites.length === SITE_LIMIT && `${SITE_LIMIT} sites`,
    reports.length === REPORT_LIMIT && `${REPORT_LIMIT} reports`,
    exceptions.length === EXCEPTION_LIMIT && `${EXCEPTION_LIMIT} exceptions`,
    approvedDays.length === APPROVED_LIMIT && `${APPROVED_LIMIT} approved attendance entries`,
    alerts.length === ALERT_LIMIT && `${ALERT_LIMIT} stock alerts`
  ].filter((c): c is string => typeof c === "string");

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead
        eyebrow={eyebrowFor(date)}
        title="Overview"
        action={isOwner === true ? <ButtonLink href={`/export?org=${org}`}>Export data</ButtonLink> : undefined}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="org" value={org} />
        <label className="au-field-row">
          <span className="ax-eyebrow">Day</span>
          <input type="date" name="date" defaultValue={date} className={inputClass} />
        </label>
        <button type="submit" className="ax-btn ax-btn-secondary">Show</button>
      </form>

      {failed ? (
        <Notice kind="error">This day could not be loaded. Reload the page; nothing is shown until every part has loaded.</Notice>
      ) : (
        <>
          {todo.length > 0 ? (
            <Notice kind="error">
              {todo.length === 1 ? "One thing needs you" : `${todo.length} things need you`} today. Only what has reached the server
              is shown: a record saved on a phone with no signal appears after it syncs.
            </Notice>
          ) : (
            <Notice kind="info">
              Nothing needs you today. Only what has reached the server is shown: a record saved on a phone with no signal appears
              after it syncs.
            </Notice>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active sites" value={stats.activeSites} />
            <StatCard label="Headcount reported" value={stats.headcountReported} />
            <StatCard label="To approve" value={stats.toApprove} alertAbove0 />
            <StatCard label="Low stock" value={stats.lowStock} alertAbove0 />
          </div>

          <div className="ov-columns">
            <Card title="Today by site" id="ov-sites">
              <DataTable<BoardRow>
                caption="Today by site"
                rows={board}
                rowKey={(r) => r.siteId}
                minWidth={560}
                empty="No sites to show for this day."
                columns={[
                  {
                    key: "site",
                    label: "Site",
                    render: (r) => (
                      <>
                        {r.siteName}
                        {r.siteStatus !== "active" && <span className="ov-site-status"> · {r.siteStatus}</span>}
                      </>
                    )
                  },
                  { key: "headcount", label: "Headcount", numeric: true, render: (r) => r.report?.headcount ?? "—" },
                  { key: "day", label: "Day status", render: (r) => <StatusTag>{DAY_WORD[r.attendance]}</StatusTag> },
                  {
                    key: "report",
                    label: "Report",
                    render: (r) => (
                      <span className="ov-tags">
                        <StatusTag>{reportWord(r)}</StatusTag>
                        {r.report?.seriousBlocker && <StatusTag tone="action">Serious blocker</StatusTag>}
                        {r.report?.safetyIncident && <StatusTag tone="action">Safety incident</StatusTag>}
                        {r.report?.flagged && !r.report.seriousBlocker && !r.report.safetyIncident && <StatusTag>Flagged</StatusTag>}
                      </span>
                    )
                  }
                ]}
              />
            </Card>

            <Card title="Needs you" id="ov-todo">
              {todo.length === 0 ? (
                <p className="ax-empty">Nothing to act on for this day.</p>
              ) : (
                <ul className="ov-todo">
                  {todo.map((t) => (
                    <li key={t.key}>
                      <span>{t.text}</span>
                      <ButtonLink href={t.href} variant={t.primary ? "primary" : "secondary"}>{t.action}</ButtonLink>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {capped.length > 0 && (
            <p className="ax-empty">Reached the limit of {capped.join(", ")}; some rows are left out, so this page may undercount.</p>
          )}
        </>
      )}
    </main>
  );
}

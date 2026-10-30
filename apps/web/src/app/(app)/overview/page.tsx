import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { isSiteRow, type ReportStatus } from "@/lib/reports/rows";
import { parseOverviewParams } from "@/lib/overview/params";
import { isAlertRow, isApprovedDayRow, isOverviewExceptionRow, isOverviewReportRow, strictRows } from "@/lib/overview/rows";
import { buildBoard, sortBoard, summarise, type AttendanceState } from "@/lib/overview/board";
import { inputClass } from "@/components/form";

// One day of 20 sites is 20 reports and a few exceptions; approved days are one row
// per worker, so their cap is the one a large roster could reach. Each read is
// ordered, and a hit cap is said on the page rather than read as "not recorded".
const SITE_LIMIT = 500;
const REPORT_LIMIT = 500;
const EXCEPTION_LIMIT = 1000;
const APPROVED_LIMIT = 5000;
const ALERT_LIMIT = 1000;

const ATTENDANCE_TEXT: Record<AttendanceState, string> = {
  approved: "Attendance approved",
  awaiting_review: "Attendance waiting for review",
  sent_back: "Attendance sent back",
  not_recorded: "No attendance recorded"
};

const REPORT_TEXT: Record<ReportStatus, string> = {
  submitted: "Report filed",
  rejected: "Report sent back",
  reviewed: "Report reviewed"
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  const [{ data: isMember }, siteRes, reportRes, exceptionRes, approvedRes, alertRes] = await Promise.all([
    supabase.rpc("is_org_member", { p_org_id: org }),
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
  const s = summarise(board);
  const capped = [
    sites.length === SITE_LIMIT && `${SITE_LIMIT} sites`,
    reports.length === REPORT_LIMIT && `${REPORT_LIMIT} reports`,
    exceptions.length === EXCEPTION_LIMIT && `${EXCEPTION_LIMIT} exceptions`,
    approvedDays.length === APPROVED_LIMIT && `${APPROVED_LIMIT} approved attendance entries`,
    alerts.length === ALERT_LIMIT && `${ALERT_LIMIT} stock alerts`
  ].filter((c): c is string => typeof c === "string");

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/dashboard" className="app-back">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">Overview</h1>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="org" value={org} />
        <label className="text-sm">
          Day
          <input type="date" name="date" defaultValue={date} className={`${inputClass} mt-1`} />
        </label>
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700">Show</button>
      </form>
      <p className="mt-2 text-xs text-neutral-500">
        Dates are in India time (IST). Only what has reached the server is shown: a report or attendance saved on a
        phone with no signal appears after it syncs. Low stock is the balance now, whatever the day.
      </p>

      {failed ? (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          This day could not be loaded. Reload the page; nothing is shown until every part has loaded.
        </p>
      ) : (
      <>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {[
          ["Active sites", s.activeSites],
          ["Reports filed", s.filed],
          ["Reports not filed", s.notFiled],
          ["Reports sent back", s.sentBack],
          ["No attendance recorded", s.attendanceNotRecorded],
          ["Flagged reports", s.flagged],
          ["Waiting for a review", s.waitingForReview]
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-neutral-200 px-3 py-2">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {board.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">No sites to show for this day.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {board.map((r) => (
            <li key={r.siteId} className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="min-w-0 truncate font-medium">
                  {r.siteName}
                  {r.siteStatus !== "active" && <span className="ml-2 text-xs font-normal text-neutral-500">{r.siteStatus}</span>}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
                  {r.report?.seriousBlocker && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Serious blocker</span>}
                  {r.report?.safetyIncident && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Safety incident</span>}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                {r.report ? (
                  <Link
                    href={`/reports/${r.report.id}?org=${org}`}
                    className={r.report.status === "rejected" ? "text-amber-800 underline" : "underline"}
                  >
                    {REPORT_TEXT[r.report.status]} · {r.report.headcount ?? "–"} workers
                  </Link>
                ) : (
                  <span className="text-amber-800">Report not filed</span>
                )}
                <Link href={`/attendance?org=${org}&site=${r.siteId}&from=${date}&to=${date}&status=all`} className="underline">
                  {ATTENDANCE_TEXT[r.attendance]}
                </Link>
                {r.geofenceFlags > 0 && <span>{plural(r.geofenceFlags, "geofence flag")}</span>}
                {r.visitsNotClosed > 0 && <span>{plural(r.visitsNotClosed, "visit", "visits")} not checked out</span>}
                {r.pendingCorrections > 0 && <span>{plural(r.pendingCorrections, "correction")} waiting</span>}
                {r.lowStock > 0 && (
                  <Link href={`/materials?org=${org}&site=${r.siteId}`} className="underline">
                    {plural(r.lowStock, "material")} low or below zero
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {capped.length > 0 && (
        <p className="mt-3 text-sm text-neutral-600">
          Reached the limit of {capped.join(", ")}; some rows are left out, so this page may undercount.
        </p>
      )}
      </>
      )}
    </main>
  );
}

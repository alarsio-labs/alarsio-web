import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { isSiteRow, rows } from "@/lib/reports/rows";
import { parseAttendanceFilters } from "@/lib/attendance/filters";
import { buildRows, filterRows, sortRows } from "@/lib/attendance/list";
import { FLAG_LABEL } from "@/lib/attendance/labels";
import { isDayRow, isExceptionRow } from "@/lib/attendance/rows";
import { dayTag } from "@/lib/attendance/screen";
import { dayLabel } from "@/lib/app/dates";
import { inputClass } from "@/components/form";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";

// 31 days of 20 sites is 620 days, so the day cap is never reached at the scale
// the product is built for. Geofence and not-closed rows are many per day, so their
// cap can be. They are read apart from the rows a review depends on (a waiting
// correction, an edited rejected day), so a full flood of geofence rows can never
// push those out, and each query is ordered, so a cap cuts the oldest rows.
const DAY_LIMIT = 1000;
const REVIEW_EXCEPTION_LIMIT = 1000;
const FLAG_EXCEPTION_LIMIT = 1000;

export default async function AttendancePage({
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
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/attendance?org=${org}`)}`);

  const f = parseAttendanceFilters(params, new Date());

  // Everything below runs as the signed-in user: RLS shows a reviewer every site of
  // the organisation, a supervisor only theirs, and nothing from another organisation.
  let days = supabase
    .from("attendance_days")
    .select("id, site_id, attendance_date, status, recorded_by, reviewed_at, review_reason")
    .eq("org_id", org)
    .gte("attendance_date", f.from)
    .lte("attendance_date", f.to)
    .order("attendance_date", { ascending: false })
    .order("id")
    .limit(DAY_LIMIT);
  // day_awaiting_review repeats an open day, so it is never read.
  const exceptionQuery = (kinds: string[], limit: number) =>
    supabase
      .from("site_exceptions")
      .select("site_id, exception_date, kind, source_id, worker_id, reason, distance_m, changed_since_review")
      .eq("org_id", org)
      .in("kind", kinds)
      .gte("exception_date", f.from)
      .lte("exception_date", f.to)
      .order("exception_date", { ascending: false })
      .order("source_id")
      .limit(limit);
  let reviewExceptions = exceptionQuery(["correction_pending", "day_rejected"], REVIEW_EXCEPTION_LIMIT);
  let flagExceptions = exceptionQuery(["geofence_check_in", "geofence_check_out", "visit_not_closed"], FLAG_EXCEPTION_LIMIT);
  if (f.site) {
    days = days.eq("site_id", f.site);
    reviewExceptions = reviewExceptions.eq("site_id", f.site);
    flagExceptions = flagExceptions.eq("site_id", f.site);
  }
  if (f.status === "open" || f.status === "rejected" || f.status === "approved") days = days.eq("status", f.status);

  // Membership through Identity's published predicate, not its tables.
  const [{ data: isMember }, { data: siteData }, { data: dayData }, { data: reviewData }, { data: flagData }] = await Promise.all([
    supabase.rpc("is_org_member", { p_org_id: org }),
    supabase.from("site_directory").select("id, name, status").eq("org_id", org).order("name"),
    days,
    reviewExceptions,
    flagExceptions
  ]);
  if (isMember !== true) redirect("/dashboard");

  const sites = rows(siteData, isSiteRow);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const dayRows = rows(dayData, isDayRow);
  const reviewRows = rows(reviewData, isExceptionRow);
  const flagRows = rows(flagData, isExceptionRow);
  const list = sortRows(filterRows(buildRows(dayRows, [...reviewRows, ...flagRows]), f.status), siteName);
  // Say which cap was hit, and that the oldest rows are the ones cut.
  const capped = [
    dayRows.length === DAY_LIMIT && `${DAY_LIMIT} days`,
    reviewRows.length === REVIEW_EXCEPTION_LIMIT && `${REVIEW_EXCEPTION_LIMIT} waiting corrections and sent-back days`,
    flagRows.length === FLAG_EXCEPTION_LIMIT && `${FLAG_EXCEPTION_LIMIT} geofence and not-closed flags`
  ].filter((c): c is string => typeof c === "string");

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead eyebrow={`${dayLabel(f.from)} to ${dayLabel(f.to)} · Asia/Kolkata`} title="Attendance" />

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
          <span className="ax-eyebrow">Show</span>
          <select name="status" defaultValue={f.status} className={inputClass}>
            <option value="needs_review">Needs review</option>
            <option value="open">Not reviewed</option>
            <option value="rejected">Rejected</option>
            <option value="approved">Approved</option>
            <option value="all">All</option>
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
        <button type="submit" className="ax-btn ax-btn-secondary">Filter</button>
      </form>
      <p className="ax-empty">Up to 31 days at a time.</p>

      <Card title="Days" id="at-days">
        <DataTable
          caption="Attendance days"
          rows={list}
          rowKey={(r) => r.key}
          minWidth={720}
          empty="Nothing matches. Widen the dates or choose All."
          columns={[
            {
              key: "site",
              label: "Site",
              render: (r) =>
                r.dayId ? (
                  <Link href={`/attendance/${r.dayId}?org=${org}`} className="underline">{siteName.get(r.siteId) ?? "Site"}</Link>
                ) : (
                  siteName.get(r.siteId) ?? "Site"
                )
            },
            { key: "date", label: "Date", render: (r) => dayLabel(r.date) },
            { key: "day", label: "Day status", render: (r) => <StatusTag>{dayTag(r.dayStatus)}</StatusTag> },
            {
              key: "corrections",
              label: "Corrections",
              numeric: true,
              render: (r) => (r.pendingCorrections > 0 ? <StatusTag tone="action">{`${r.pendingCorrections} waiting`}</StatusTag> : "—")
            },
            {
              key: "flags",
              label: "Flags",
              render: (r) => {
                const flags = r.flags.filter((flag) => flag !== "correction_pending");
                return flags.length === 0 ? "—" : (
                  <span className="ov-tags">
                    {flags.map((flag) => <StatusTag key={flag} tone="action">{FLAG_LABEL[flag]}</StatusTag>)}
                  </span>
                );
              }
            }
          ]}
        />
      </Card>
      {capped.length > 0 && (
        <p className="ax-empty">
          Showing only the newest {capped.join(", ")}; older ones are left out. Narrow the dates or the site to see them.
        </p>
      )}
    </main>
  );
}

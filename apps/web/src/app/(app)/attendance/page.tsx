import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { isSiteRow, rows } from "@/lib/reports/rows";
import { parseAttendanceFilters } from "@/lib/attendance/filters";
import { buildRows, filterRows, sortRows } from "@/lib/attendance/list";
import { DAY_STATUS_LABEL, FLAG_LABEL } from "@/lib/attendance/labels";
import { isDayRow, isExceptionRow } from "@/lib/attendance/rows";
import { inputClass } from "@/components/form";

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
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="app-back">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">Attendance</h1>

      <form method="get" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <input type="hidden" name="org" value={org} />
        <label className="text-sm">
          Site
          <select name="site" defaultValue={f.site ?? ""} className={`${inputClass} mt-1`}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          Show
          <select name="status" defaultValue={f.status} className={`${inputClass} mt-1`}>
            <option value="needs_review">Needs review</option>
            <option value="open">Not reviewed</option>
            <option value="rejected">Rejected</option>
            <option value="approved">Approved</option>
            <option value="all">All</option>
          </select>
        </label>
        <div className="hidden sm:block" />
        <label className="text-sm">
          From
          <input type="date" name="from" defaultValue={f.from} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm">
          To
          <input type="date" name="to" defaultValue={f.to} className={`${inputClass} mt-1`} />
        </label>
        <div className="flex items-end">
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700">Filter</button>
        </div>
      </form>
      <p className="mt-2 text-xs text-neutral-500">Dates are in India time (IST). Up to 31 days at a time.</p>

      {list.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">Nothing matches.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {list.map((r) => {
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{siteName.get(r.siteId) ?? "Site"}</span>
                  <span className="text-sm text-neutral-500">
                    {r.date} · {r.dayStatus ? DAY_STATUS_LABEL[r.dayStatus] : "No attendance recorded"}
                    {r.pendingCorrections > 0 && ` · ${r.pendingCorrections} correction${r.pendingCorrections === 1 ? "" : "s"} waiting`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
                  {r.flags.filter((flag) => flag !== "correction_pending").map((flag) => (
                    <span key={flag} className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">{FLAG_LABEL[flag]}</span>
                  ))}
                </span>
              </>
            );
            return (
              <li key={r.key}>
                {r.dayId ? (
                  <Link href={`/attendance/${r.dayId}?org=${org}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4 px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {capped.length > 0 && (
        <p className="mt-3 text-sm text-neutral-600">
          Showing only the newest {capped.join(", ")}; older ones are left out. Narrow the dates or the site to see them.
        </p>
      )}
    </main>
  );
}

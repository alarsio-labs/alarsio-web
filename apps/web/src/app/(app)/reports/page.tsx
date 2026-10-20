import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { parseReportFilters } from "@/lib/reports/filters";
import { sortReports } from "@/lib/reports/order";
import { UUID, isReportStatusRow, isSiteRow, rows } from "@/lib/reports/rows";
import { inputClass } from "@/components/form";

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
  const [{ data: isMember }, { data: siteData }, { data: reportData }] = await Promise.all([
    supabase.rpc("is_org_member", { p_org_id: org }),
    supabase.from("site_directory").select("id, name, status").eq("org_id", org).order("name"),
    query
  ]);
  if (isMember !== true) redirect("/dashboard");

  const sites = rows(siteData, isSiteRow);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const reports = sortReports(rows(reportData, isReportStatusRow));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">Daily reports</h1>

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
          Status
          <select name="status" defaultValue={f.status} className={`${inputClass} mt-1`}>
            <option value="all">All</option>
            <option value="submitted">Not reviewed</option>
            <option value="rejected">Sent back</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="flagged" value="1" defaultChecked={f.flaggedOnly} /> Flagged only
        </label>
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
      <p className="mt-2 text-xs text-neutral-500">Up to 31 days at a time.</p>

      {reports.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">No reports match.</p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/reports/${r.id}?org=${org}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{siteName.get(r.site_id) ?? "Site"}</span>
                  <span className="text-sm text-neutral-500">
                    {r.report_date} · {r.headcount ?? "–"} workers · {r.photo_count} photo{r.photo_count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
                  {r.serious_blocker && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Serious blocker</span>}
                  {r.safety_incident && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Safety incident</span>}
                  <span className={r.status === "rejected" ? "text-amber-800" : "text-neutral-600"}>
                    {r.status === "reviewed" ? "Reviewed" : r.status === "rejected" ? "Sent back" : "Not reviewed"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {reports.length === LIMIT && (
        <p className="mt-3 text-sm text-neutral-600">Showing the first {LIMIT}. Narrow the filters to see the rest.</p>
      )}
    </main>
  );
}

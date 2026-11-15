import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthUser, supabaseServer } from "@/lib/supabase/server";
import { strictRows } from "@/lib/overview/rows";
import { isUsageRow, shapeUsage, type UsageView } from "@/lib/staff/usage";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";

// A page for our own team (ADR-052). Not linked from any menu, and not indexed.
export const metadata: Metadata = { title: "Organisation usage", robots: { index: false, follow: false } };

export default async function StaffUsagePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showTest = params.test === "1";

  const {
    data: { user }
  } = await getAuthUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent("/staff/usage")}`);

  // The database decides. staff_org_usage() refuses anyone who is not on the allowlist
  // with 42501, and then this page does not exist for them: the same 404 as any
  // address that is not there, so it never says it is a staff page. Presentation only;
  // nothing below is shown unless the function answered.
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("staff_org_usage");
  if (error?.code === "42501") notFound();

  const read = error ? null : strictRows(data, isUsageRow);
  const screen = read ? shapeUsage(read, { showTest }) : null;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead
        eyebrow="Team only · counts, never names"
        title="Organisation usage"
        aside={
          <nav className="ax-seg" aria-label="Which organisations">
            <a href="/staff/usage" className="ax-seg-item" aria-current={showTest ? undefined : "page"}>
              Customers
            </a>
            <a href="/staff/usage?test=1" className="ax-seg-item" aria-current={showTest ? "page" : undefined}>
              Show test orgs
            </a>
          </nav>
        }
      />

      {screen === null ? (
        <Notice kind="error">The usage could not be loaded. Reload the page; nothing is shown until every row has loaded.</Notice>
      ) : (
        <>
          <Notice kind="info">
            Only what has reached the server is counted: a record saved on a phone with no signal appears after it syncs. Records are
            attendance marks, daily reports, material entries and site check-ins, by the day they reached the server (India time).
          </Notice>

          <Card title="Usage by organisation" id="su-usage">
            <DataTable<UsageView>
              caption="Usage by organisation"
              rows={screen.rows}
              rowKey={(r) => r.orgId}
              minWidth={1180}
              empty="No organisations to show."
              columns={[
                { key: "org", label: "Organisation", render: (r) => r.name },
                { key: "created", label: "Created", render: (r) => r.created },
                { key: "members", label: "Members", render: (r) => r.members },
                { key: "active", label: "Active (28 days)", numeric: true, render: (r) => r.activeUsers },
                { key: "sites", label: "Sites", numeric: true, render: (r) => r.sites },
                { key: "workers", label: "Workers", numeric: true, render: (r) => r.workers },
                { key: "attendance", label: "Attendance marks", numeric: true, render: (r) => r.attendance },
                { key: "reports", label: "Daily reports", numeric: true, render: (r) => r.reports },
                { key: "materials", label: "Material entries", numeric: true, render: (r) => r.materials },
                { key: "checkins", label: "Site check-ins", numeric: true, render: (r) => r.checkIns },
                { key: "last", label: "Last active", render: (r) => r.lastActive },
                { key: "signin", label: "Last sign-in", render: (r) => r.lastSignIn }
              ]}
            />
          </Card>

          <Card title="Records in the last four weeks" id="su-weeks">
            <DataTable<UsageView>
              caption="Records created per week, oldest first"
              rows={screen.rows}
              rowKey={(r) => r.orgId}
              minWidth={560}
              empty="No organisations to show."
              columns={[
                { key: "org", label: "Organisation", render: (r) => r.name },
                ...screen.weekLabels.map((label, i) => ({
                  key: `w${i}`,
                  label,
                  numeric: true,
                  render: (r: UsageView) => r.weeks[i] ?? 0
                }))
              ]}
            />
          </Card>

          {screen.hidden > 0 && !showTest && (
            <p className="ax-empty">
              {screen.hidden} test {screen.hidden === 1 ? "organisation is" : "organisations are"} hidden.{" "}
              <a href="/staff/usage?test=1">Show them</a>
            </p>
          )}
        </>
      )}
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { Field, buttonClass, inputClass } from "@/components/form";
import { readPeriods, type Period } from "@/lib/wages/read";
import { dayLabel } from "@/lib/app/dates";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { createPeriod } from "./actions";

export default async function WagesPage({
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
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/wages?org=${org}`)}`);

  // can_view_wages (owner, accountant) is the predicate every wage table uses. RLS
  // filters every read either way; this only keeps other roles off the page.
  const [{ data: orgRow }, { data: canView }, periods] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.rpc("can_view_wages", { p_org_id: org }),
    readPeriods(supabase, org)
  ]);
  if (!orgRow || canView !== true) redirect("/dashboard");
  const error = messageFor(params.error);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead eyebrow={orgRow.name} title="Wage summaries" />
      <Notice kind="info">Built from approved attendance only. A day that is still open, or was sent back, is not counted.</Notice>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="ov-columns">
        <Card title="Periods" id="wg-periods">
          <DataTable<Period>
            caption="Wage periods"
            rows={periods}
            rowKey={(p) => p.id}
            minWidth={480}
            empty="No periods yet. Start one."
            columns={[
              { key: "range", label: "Period", render: (p) => <Link href={`/wages/${p.id}?org=${org}`} className="underline">{dayLabel(p.start_date)} to {dayLabel(p.end_date)}</Link> },
              { key: "type", label: "Length", render: (p) => (p.period_type === "month" ? "Month" : "Week") },
              // Locked is settled (ink); a draft is still being worked on (muted).
              { key: "status", label: "Status", render: (p) => <StatusTag tone={p.status === "locked" ? "ink" : "muted"}>{p.status === "locked" ? "Locked" : "Draft"}</StatusTag> }
            ]}
          />
        </Card>

        <Card title="New period" id="wg-new">
          <form action={createPeriod} className="space-y-4">
            <input type="hidden" name="org_id" value={org} />
            <Field label="Period">
              <select name="period_type" required className={inputClass} defaultValue="week">
                <option value="week">Week (seven days from the date)</option>
                <option value="month">Month (the whole calendar month of the date)</option>
              </select>
            </Field>
            <Field label="Start date">
              <input name="start_date" type="date" required className={inputClass} />
            </Field>
            <button type="submit" className={buttonClass}>Create period</button>
          </form>
        </Card>
      </div>
    </main>
  );
}

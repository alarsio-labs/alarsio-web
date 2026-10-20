import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { Field, Notice, buttonClass, inputClass } from "@/components/form";
import { createPeriod } from "./actions";

type PeriodRow = { id: string; period_type: string; start_date: string; end_date: string; status: string };

function toPeriod(v: unknown): PeriodRow | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (
    typeof r.id !== "string" || typeof r.period_type !== "string" || typeof r.start_date !== "string" ||
    typeof r.end_date !== "string" || typeof r.status !== "string"
  ) {
    return null;
  }
  return { id: r.id, period_type: r.period_type, start_date: r.start_date, end_date: r.end_date, status: r.status };
}

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
  const [{ data: orgRow }, { data: canView }, { data: periodData }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.rpc("can_view_wages", { p_org_id: org }),
    supabase
      .from("wage_periods")
      .select("id, period_type, start_date, end_date, status")
      .eq("org_id", org)
      .order("start_date", { ascending: false })
      .limit(200)
  ]);
  if (!orgRow || canView !== true) redirect("/dashboard");

  const periods = Array.isArray(periodData) ? periodData.map(toPeriod).filter((p): p is PeriodRow => p !== null) : [];
  const error = messageFor(params.error);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">{orgRow.name} · Wage summaries</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Built from approved attendance only. A day that is still open, or was sent back, is not counted.
      </p>

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Periods</h2>
        {periods.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No periods yet. Start one below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <Link href={`/wages/${p.id}?org=${org}`} className="underline">
                  {p.start_date} to {p.end_date}
                </Link>
                <span className="flex items-center gap-3">
                  <span className="text-neutral-500">{p.period_type}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      p.status === "locked" ? "bg-neutral-200 text-neutral-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {p.status === "locked" ? "Locked" : "Draft"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">New period</h2>
        <form action={createPeriod} className="mt-3 space-y-4">
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
      </section>
    </main>
  );
}

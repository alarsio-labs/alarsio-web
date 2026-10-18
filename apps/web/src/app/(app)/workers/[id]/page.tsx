import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor, noticeFor } from "@/lib/messages";
import { UUID } from "@/lib/workers/form";
import { Field, Notice, buttonClass, inputClass } from "@/components/form";
import { addRate, anonymize, assignToSite, saveWorker, unassign } from "./actions";

type Worker = {
  id: string;
  code: string;
  full_name: string;
  phone: string | null;
  trade: string;
  pay_type: string;
  status: string;
  anonymized_at: string | null;
};
type Rate = { id: string; rate: number | string; effective_from: string };
type RosterRow = { assignment_id: string; site_id: string; assigned_at: string; unassigned_at: string | null };
type Site = { id: string; name: string; status: string };

function rows<T>(data: unknown, keys: string[]): T[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (r): r is T => typeof r === "object" && r !== null && keys.every((k) => k in (r as Record<string, unknown>))
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const rupees = (v: number | string) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function WorkerPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const org = query.org;
  if (!UUID.test(id) || typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/workers/${id}?org=${org}`)}`);

  const [{ data: workerRow }, { data: canManage }, { data: canWages }, ratesRes, rosterRes, sitesRes] = await Promise.all([
    supabase
      .from("workers")
      .select("id, code, full_name, phone, trade, pay_type, status, anonymized_at")
      .eq("id", id)
      .eq("org_id", org)
      .maybeSingle(),
    supabase.rpc("can_manage_sites", { p_org_id: org }),
    supabase.rpc("can_view_wages", { p_org_id: org }),
    supabase.from("worker_wage_rates").select("id, rate, effective_from").eq("worker_id", id).order("effective_from", { ascending: false }),
    supabase.from("worker_roster").select("assignment_id, site_id, assigned_at, unassigned_at").eq("worker_id", id).order("assigned_at", { ascending: false }),
    supabase.from("sites").select("id, name, status").eq("org_id", org).order("name")
  ]);
  if (!workerRow) redirect(`/workers?org=${org}`);
  const worker = workerRow as Worker;

  // RLS already returns no rates to someone who may not see them.
  const rates = rows<Rate>(ratesRes.data, ["id", "rate", "effective_from"]);
  const roster = rows<RosterRow>(rosterRes.data, ["assignment_id", "site_id", "assigned_at"]);
  const sites = rows<Site>(sitesRes.data, ["id", "name", "status"]);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const openSites = new Set(roster.filter((r) => !r.unassigned_at).map((r) => r.site_id));
  const assignable = sites.filter((s) => s.status !== "archived" && !openSites.has(s.id));

  const manage = canManage === true && !worker.anonymized_at;
  const active = worker.status === "active" && !worker.anonymized_at;
  const error = messageFor(query.error);
  const notice = noticeFor(query.done);
  const hidden = (
    <>
      <input type="hidden" name="org_id" value={org} />
      <input type="hidden" name="worker_id" value={worker.id} />
    </>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/workers?org=${org}`} className="text-sm underline">← Workers</Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {worker.full_name} <span className="font-mono text-base text-neutral-500">{worker.code}</span>
      </h1>
      <p className="text-sm text-neutral-600">
        {worker.trade} · {worker.pay_type} · {worker.anonymized_at ? "personal details removed" : worker.status}
      </p>

      <div className="mt-6 space-y-2">
        {error && <Notice kind="error">{error}</Notice>}
        {notice && <Notice kind="info">{notice}</Notice>}
      </div>

      {manage && (
        <section className="mt-8 max-w-sm">
          <h2 className="text-lg font-medium">Details</h2>
          <form action={saveWorker} className="mt-4 space-y-3">
            {hidden}
            <Field label="Name">
              <input name="full_name" required maxLength={120} defaultValue={worker.full_name} className={inputClass} />
            </Field>
            <Field label="Trade">
              <input name="trade" required maxLength={60} defaultValue={worker.trade} className={inputClass} />
            </Field>
            <Field label="Pay type">
              <select name="pay_type" defaultValue={worker.pay_type} className={inputClass}>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </Field>
            <Field label="Phone (optional)">
              <input name="phone" type="tel" maxLength={30} defaultValue={worker.phone ?? ""} className={inputClass} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={worker.status} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive (left, kept for history)</option>
              </select>
            </Field>
            <button type="submit" className={buttonClass}>Save</button>
          </form>
        </section>
      )}

      {canWages === true && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Wage rate</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Per {worker.pay_type === "hourly" ? "hour" : "day"}. A new rate starts on its date; earlier rates stay for past wages.
          </p>
          {rates.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No rate yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
              {rates.map((r) => (
                <li key={r.id} className="flex justify-between px-3 py-2">
                  <span>{rupees(r.rate)}</span>
                  <span className="text-neutral-600">from {day(r.effective_from)}</span>
                </li>
              ))}
            </ul>
          )}
          {!worker.anonymized_at && (
            <form action={addRate} className="mt-4 flex flex-wrap items-end gap-3">
              {hidden}
              <Field label="New rate (₹)">
                <input name="rate" inputMode="decimal" required pattern="\d{1,10}(\.\d{1,2})?" className={inputClass} />
              </Field>
              <Field label="Starts on">
                <input name="effective_from" type="date" required className={inputClass} />
              </Field>
              <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white">Add rate</button>
            </form>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Sites</h2>
        {roster.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">Not on any site.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {roster.map((r) => (
              <li key={r.assignment_id} className="flex items-center justify-between gap-4 px-3 py-2">
                <span>
                  {siteName.get(r.site_id) ?? "Site"}{" "}
                  <span className="text-neutral-500">
                    · {day(r.assigned_at)}{r.unassigned_at ? ` – ${day(r.unassigned_at)}` : " – now"}
                  </span>
                </span>
                {manage && !r.unassigned_at && (
                  <form action={unassign}>
                    {hidden}
                    <input type="hidden" name="assignment_id" value={r.assignment_id} />
                    <button type="submit" className="underline">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {manage && active && assignable.length > 0 && (
          <form action={assignToSite} className="mt-4 flex flex-wrap items-end gap-3">
            {hidden}
            <Field label="Add to site">
              <select name="site_id" className={inputClass}>
                {assignable.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white">Assign</button>
          </form>
        )}
      </section>

      {manage && (
        <section className="mt-12 max-w-sm rounded-md border border-red-200 p-4">
          <h2 className="font-medium text-red-800">Remove personal details</h2>
          <p className="mt-1 text-sm text-neutral-700">
            Clears the name and phone, marks the worker inactive and ends their site assignments. Attendance and
            wage history stay. This cannot be undone.
          </p>
          <form action={anonymize} className="mt-3 space-y-3">
            {hidden}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" required /> I understand
            </label>
            <button type="submit" className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-800">
              Remove personal details
            </button>
          </form>
        </section>
      )}
    </main>
  );
}

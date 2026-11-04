import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDay, formatInstant, todayInIndia } from "@/lib/dates";
import { messageFor, noticeFor } from "@/lib/messages";
import { MAX_RATE, UUID, rateDateWindow } from "@/lib/workers/form";
import { Field, buttonClass, inputClass } from "@/components/form";
import { Button } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
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

  const [{ data: workerRow }, { data: canManage }, { data: canWages }] = await Promise.all([
    supabase
      .from("workers")
      .select("id, code, full_name, phone, trade, pay_type, status, anonymized_at")
      .eq("id", id)
      .eq("org_id", org)
      .maybeSingle(),
    supabase.rpc("can_manage_sites", { p_org_id: org }),
    supabase.rpc("can_view_wages", { p_org_id: org })
  ]);
  // Owners, project managers and accountants only. A supervisor can read a
  // worker at their site through RLS, but this page is not for them.
  if (canManage !== true && canWages !== true) redirect("/dashboard");
  if (!workerRow) redirect(`/workers?org=${org}`);
  const worker = workerRow as Worker;

  const none = Promise.resolve({ data: [] as unknown[] });
  const [ratesRes, rosterRes, sitesRes] = await Promise.all([
    canWages === true
      ? supabase.from("worker_wage_rates").select("id, rate, effective_from").eq("worker_id", id).order("effective_from", { ascending: false })
      : none,
    // Site history is for managers. An accountant sees only sites they are
    // assigned to (has_site_access), so their list would be wrong, not empty.
    canManage === true
      ? supabase.from("worker_roster").select("assignment_id, site_id, assigned_at, unassigned_at").eq("worker_id", id).order("assigned_at", { ascending: false })
      : none,
    // Site names through Sites' published view (ADR-025), never the table.
    canManage === true ? supabase.from("site_directory").select("id, name, status").eq("org_id", org).order("name") : none
  ]);

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
  const window = rateDateWindow(todayInIndia());
  const notice = noticeFor(query.done);
  const hidden = (
    <>
      <input type="hidden" name="org_id" value={org} />
      <input type="hidden" name="worker_id" value={worker.id} />
    </>
  );

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:py-10">
      <div>
        <Link href={`/workers?org=${org}`} className="app-back">← Workers</Link>
        <PageHead eyebrow={`Worker · ${worker.code}`} title={worker.full_name} />
        <p className="at-meta">
          <StatusTag tone={worker.status === "active" && !worker.anonymized_at ? "ink" : "muted"}>
            {worker.anonymized_at ? "Personal details removed" : worker.status === "active" ? "Active" : "Inactive"}
          </StatusTag>
          <span>{worker.trade} · {worker.pay_type === "hourly" ? "Hourly" : "Daily"}</span>
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="info">{notice}</Notice>}

      {manage && (
        <Card title="Details" id="wk-details">
          <form action={saveWorker} className="max-w-md space-y-3">
            {hidden}
            <Field label="Name">
              <input name="full_name" required maxLength={120} defaultValue={worker.full_name} className={inputClass} />
            </Field>
            <Field label="Trade">
              <input name="trade" required maxLength={60} defaultValue={worker.trade} className={inputClass} />
            </Field>
            <Field label={rates.length > 0 || canWages !== true ? "Pay type (fixed once a rate exists)" : "Pay type"}>
              <select name="pay_type" defaultValue={worker.pay_type} className={inputClass}>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </Field>
            <Field label="Phone (optional)">
              <input name="phone" type="tel" maxLength={20} defaultValue={worker.phone ?? ""} className={inputClass} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={worker.status} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive (left, kept for history)</option>
              </select>
            </Field>
            <button type="submit" className={buttonClass}>Save</button>
          </form>
        </Card>
      )}

      {canWages === true && (
        <Card title="Wage rate" id="wk-rates">
          <p className="ax-empty">
            Per {worker.pay_type === "hourly" ? "hour" : "day"}. A new rate starts on its date; earlier rates stay for past wages.
          </p>
          {rates.length === 0 ? (
            <p className="mt-3 ax-empty">No rate yet.</p>
          ) : (
            <ul className="ov-todo mt-3">
              {rates.map((r) => (
                <li key={r.id}>
                  <span className="font-semibold tabular-nums">{rupees(r.rate)}</span>
                  <span className="ax-empty">from {formatDay(r.effective_from)}</span>
                </li>
              ))}
            </ul>
          )}
          {!worker.anonymized_at && (
            <form action={addRate} className="mt-4 flex flex-wrap items-end gap-3">
              {hidden}
              <Field label="New rate (₹)">
                <input name="rate" inputMode="decimal" required pattern="\d{1,7}(\.\d{1,2})?" title={`Up to ₹${MAX_RATE.toLocaleString("en-IN")}, two decimals at most`} className={inputClass} />
              </Field>
              <Field label="Starts on">
                <input name="effective_from" type="date" required min={window.min} max={window.max} className={inputClass} />
              </Field>
              <Button type="submit">Add rate</Button>
            </form>
          )}
        </Card>
      )}

      {canManage === true && (
        <Card title="Sites" id="wk-sites">
          {roster.length === 0 ? (
            <p className="ax-empty">Not on any site.</p>
          ) : (
            <ul className="ov-todo">
              {roster.map((r) => (
                <li key={r.assignment_id}>
                  <span>
                    {siteName.get(r.site_id) ?? "Site"}{" "}
                    <span className="ax-empty">
                      · {formatInstant(r.assigned_at)}{r.unassigned_at ? ` – ${formatInstant(r.unassigned_at)}` : " – now"}
                    </span>
                  </span>
                  {manage && !r.unassigned_at && (
                    <form action={unassign}>
                      {hidden}
                      <input type="hidden" name="assignment_id" value={r.assignment_id} />
                      <Button type="submit" variant="secondary" aria-label={`Remove from ${siteName.get(r.site_id) ?? "site"}`}>Remove</Button>
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
              <Button type="submit">Assign</Button>
            </form>
          )}
        </Card>
      )}

      {manage && (
        // A destructive action keeps its confirm step and the ordinary buttons: there is no red button.
        <Card title="Remove personal details" id="wk-remove">
          <Notice kind="error">This cannot be undone.</Notice>
          <p className="mt-3">
            Clears the name and phone, marks the worker inactive and ends their site assignments. Attendance and wage history
            stay.
          </p>
          <form action={anonymize} className="mt-3 space-y-3">
            {hidden}
            <label>
              <input type="checkbox" name="confirm" value="yes" required /> I understand
            </label>
            <div><Button type="submit" variant="secondary">Remove personal details</Button></div>
          </form>
        </Card>
      )}
    </main>
  );
}

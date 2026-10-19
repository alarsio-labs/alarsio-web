import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { Notice, buttonClass, inputClass } from "@/components/form";
import { isSiteRow, rows } from "@/lib/reports/rows";
import { MATERIAL_UNITS, unitLabel } from "@/lib/materials/units";
import { formatQty, toAlertRow, toBalanceRow, type AlertRow, type BalanceRow } from "@/lib/materials/stock";
import { createMaterial, updateMaterial } from "./actions";

const LIMIT = 500;

const ALERT_TEXT = { negative: "Below zero", low: "Low" } as const;
const ALERT_TONE = { negative: "bg-red-100 text-red-800", low: "bg-amber-100 text-amber-800" } as const;

function many<T>(data: unknown, convert: (v: unknown) => T | null): { items: T[]; dropped: number } {
  if (!Array.isArray(data)) return { items: [], dropped: 0 };
  const items = data.map(convert).filter((v): v is T => v !== null);
  return { items, dropped: data.length - items.length };
}

export default async function MaterialsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const org = params.org;
  if (typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");
  const siteParam = typeof params.site === "string" && UUID.test(params.site) ? params.site : null;

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `/materials?org=${org}${siteParam ? `&site=${siteParam}` : ""}`;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  // Defining materials is can_manage_sites (owner, project manager), the same
  // predicate the materials policies use. RLS filters every read either way.
  let balancesQuery = supabase
    .from("material_balances")
    .select("material_id, site_id, name, unit, low_stock_threshold, balance, transaction_count, last_movement_on")
    .eq("org_id", org)
    .order("name")
    .limit(LIMIT);
  let alertsQuery = supabase
    .from("material_alerts")
    .select("material_id, site_id, name, unit, balance, low_stock_threshold, alert")
    .eq("org_id", org)
    .order("name")
    .limit(LIMIT);
  if (siteParam) {
    balancesQuery = balancesQuery.eq("site_id", siteParam);
    alertsQuery = alertsQuery.eq("site_id", siteParam);
  }

  // Site names through Sites' published view, not its table.
  const [{ data: orgRow }, { data: canManage }, { data: siteData }, { data: balanceData }, { data: alertData }] =
    await Promise.all([
      supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
      supabase.rpc("can_manage_sites", { p_org_id: org }),
      supabase.from("site_directory").select("id, name, status").eq("org_id", org).order("name"),
      siteParam ? balancesQuery : Promise.resolve({ data: [] }),
      alertsQuery
    ]);
  if (!orgRow || canManage !== true) redirect("/dashboard");

  const sites = rows(siteData, isSiteRow);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const site = siteParam ? sites.find((s) => s.id === siteParam) : undefined;
  if (siteParam && !site) redirect(`/materials?org=${org}`);

  const balances = many<BalanceRow>(balanceData, toBalanceRow);
  const alerts = many<AlertRow>(alertData, toAlertRow);
  // The material_alerts view decides what is low or below zero; a row is marked from it.
  const alertOf = new Map(alerts.items.map((a) => [a.material_id, a.alert]));
  const error = messageFor(params.error);
  const saved = params.saved === "1";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">
        {orgRow.name} · Materials{site ? ` · ${site.name}` : ""}
      </h1>
      {site && <Link href={`/materials?org=${org}`} className="text-sm underline">← All sites</Link>}

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}
      {saved && !error && <div className="mt-6"><Notice kind="info">Saved.</Notice></div>}
      {(balances.dropped > 0 || alerts.dropped > 0) && (
        <div className="mt-6">
          <Notice kind="error">Some materials could not be shown. Reload, and tell the team if this stays.</Notice>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Needs attention{site ? "" : " (all sites)"}</h2>
        {alerts.items.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">Nothing is low or below zero.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200">
            {alerts.items.map((a) => (
              <li key={a.material_id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  {a.name}
                  {!site && (
                    <>
                      {" · "}
                      <Link href={`/materials?org=${org}&site=${a.site_id}`} className="underline">
                        {siteName.get(a.site_id) ?? "Site"}
                      </Link>
                    </>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{formatQty(a.balance)} {a.unit}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${ALERT_TONE[a.alert]}`}>{ALERT_TEXT[a.alert]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!site ? (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Sites</h2>
          {sites.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600">No sites yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200">
              {sites.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <Link href={`/materials?org=${org}&site=${s.id}`} className="underline">{s.name}</Link>
                  <span className="text-neutral-500">{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {site.status === "archived" && (
            <p className="mt-6 text-sm text-neutral-600">
              This site is archived. You can still change what its materials are called, but no one can record stock on it.
            </p>
          )}

          <section className="mt-10">
            <h2 className="text-lg font-medium">Materials ({balances.items.length})</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Balances are worked out by the server from what supervisors record. The unit cannot be changed once a material
              exists: add a new material instead.
            </p>
            {balances.items.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-600">No materials at this site yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-neutral-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Material</th>
                      <th className="px-3 py-2 font-medium">Balance</th>
                      <th className="px-3 py-2 font-medium">Low at</th>
                      <th className="px-3 py-2 font-medium">Last movement</th>
                      <th className="px-3 py-2 font-medium"><span className="sr-only">Edit</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {balances.items.map((m) => {
                      const state = alertOf.get(m.material_id) ?? "ok";
                      return (
                        <tr key={m.material_id} className="align-top">
                          <td className="px-3 py-2">{m.name}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatQty(m.balance)} {m.unit}
                            {state !== "ok" && (
                              <span className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${ALERT_TONE[state]}`}>{ALERT_TEXT[state]}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {m.low_stock_threshold === null ? "No alert" : `${formatQty(m.low_stock_threshold)} ${m.unit}`}
                          </td>
                          <td className="px-3 py-2">{m.last_movement_on ?? "None yet"}</td>
                          <td className="px-3 py-2">
                            <details>
                              <summary className="cursor-pointer underline">Edit</summary>
                              <form action={updateMaterial} className="mt-2 grid gap-2">
                                <input type="hidden" name="org_id" value={org} />
                                <input type="hidden" name="site_id" value={m.site_id} />
                                <input type="hidden" name="material_id" value={m.material_id} />
                                <label className="text-xs">
                                  Name
                                  <input name="name" defaultValue={m.name} required maxLength={120} className={`${inputClass} mt-1`} />
                                </label>
                                <label className="text-xs">
                                  Low-stock level ({m.unit})
                                  <input
                                    name="threshold"
                                    defaultValue={m.low_stock_threshold === null ? "" : String(m.low_stock_threshold)}
                                    inputMode="decimal"
                                    placeholder="No alert"
                                    className={`${inputClass} mt-1`}
                                  />
                                </label>
                                <button type="submit" className={buttonClass}>Save</button>
                              </form>
                            </details>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {balances.items.length >= LIMIT && (
              <p className="mt-2 text-sm text-neutral-600">Showing the first {LIMIT} materials.</p>
            )}
          </section>

          <section className="mt-10 max-w-md">
            <h2 className="text-lg font-medium">Add a material</h2>
            <form action={createMaterial} className="mt-3 grid gap-3">
              <input type="hidden" name="org_id" value={org} />
              <input type="hidden" name="site_id" value={site.id} />
              <label className="text-sm">
                Name
                <input name="name" required maxLength={120} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm">
                Unit
                <select name="unit" required defaultValue="" className={`${inputClass} mt-1`}>
                  <option value="" disabled>Choose a unit</option>
                  {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                </select>
              </label>
              <label className="text-sm">
                Low-stock level (optional)
                <input name="threshold" inputMode="decimal" placeholder="No alert" className={`${inputClass} mt-1`} />
              </label>
              <button type="submit" className={buttonClass}>Add material</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}

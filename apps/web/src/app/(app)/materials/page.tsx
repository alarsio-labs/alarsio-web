import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { messageFor } from "@/lib/messages";
import { buttonClass, inputClass } from "@/components/form";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { isSiteRow, rows } from "@/lib/reports/rows";
import { MATERIAL_UNITS, unitLabel } from "@/lib/materials/units";
import { formatQty, toAlertRow, toBalanceRow, type AlertRow, type BalanceRow } from "@/lib/materials/stock";
import { createMaterial, updateMaterial } from "./actions";

const LIMIT = 500;

// Both ask for action, so both are red-deep tags (lib/app/status.ts).
const ALERT_TEXT = { negative: "Below zero", low: "Low stock" } as const;

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
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <div>
        {site && <Link href={`/materials?org=${org}`} className="app-back">← All sites</Link>}
        <PageHead eyebrow={site ? `Materials · ${orgRow.name}` : orgRow.name} title={site ? site.name : "Materials"} />
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {saved && !error && <Notice kind="info">Saved.</Notice>}
      {(balances.dropped > 0 || alerts.dropped > 0) && (
        <Notice kind="error">Some materials could not be shown. Reload, and tell the team if this stays.</Notice>
      )}

      <Card title={site ? "Needs attention" : "Needs attention, all sites"} id="ma-alerts">
        <DataTable<AlertRow>
          caption="Materials that need attention"
          rows={alerts.items}
          rowKey={(a) => a.material_id}
          minWidth={site ? 420 : 560}
          empty="Nothing is low or below zero."
          columns={[
            { key: "name", label: "Material", render: (a) => a.name },
            ...(site
              ? []
              : [{
                  key: "site",
                  label: "Site",
                  render: (a: AlertRow) => <Link href={`/materials?org=${org}&site=${a.site_id}`} className="underline">{siteName.get(a.site_id) ?? "Site"}</Link>
                }]),
            { key: "balance", label: "Balance", numeric: true, render: (a) => `${formatQty(a.balance)} ${a.unit}` },
            { key: "state", label: "State", render: (a) => <StatusTag tone="action">{ALERT_TEXT[a.alert]}</StatusTag> }
          ]}
        />
      </Card>

      {!site ? (
        <Card title="Sites" id="ma-sites">
          <DataTable
            caption="Sites"
            rows={sites}
            rowKey={(s) => s.id}
            minWidth={360}
            empty="No sites yet."
            columns={[
              { key: "name", label: "Site", render: (s) => <Link href={`/materials?org=${org}&site=${s.id}`} className="underline">{s.name}</Link> },
              { key: "status", label: "Status", render: (s) => <StatusTag tone={s.status === "active" || s.status === "completed" ? "ink" : "muted"}>{s.status}</StatusTag> }
            ]}
          />
        </Card>
      ) : (
        <>
          {site.status === "archived" && (
            <Notice kind="info">This site is archived. You can still change what its materials are called, but no one can record stock on it.</Notice>
          )}

          <Card title={`Materials (${balances.items.length})`} id="ma-materials">
            <p className="ax-empty mb-3">
              Balances are worked out by the server from what supervisors record. The unit cannot be changed once a material
              exists: add a new material instead.
            </p>
            <DataTable<BalanceRow>
              caption="Materials at this site"
              rows={balances.items}
              rowKey={(m) => m.material_id}
              minWidth={720}
              empty="No materials at this site yet."
              columns={[
                { key: "name", label: "Material", render: (m) => m.name },
                {
                  key: "balance",
                  label: "Balance",
                  numeric: true,
                  render: (m) => {
                    const state = alertOf.get(m.material_id) ?? "ok";
                    return (
                      <span className="ov-tags justify-end">
                        {formatQty(m.balance)} {m.unit}
                        {state !== "ok" && <StatusTag tone="action">{ALERT_TEXT[state]}</StatusTag>}
                      </span>
                    );
                  }
                },
                { key: "low", label: "Low at", numeric: true, render: (m) => (m.low_stock_threshold === null ? "No alert" : `${formatQty(m.low_stock_threshold)} ${m.unit}`) },
                { key: "last", label: "Last movement", render: (m) => m.last_movement_on ?? "None yet" },
                {
                  key: "edit",
                  label: "Edit",
                  render: (m) => (
                    <details>
                      <summary className="ax-btn ax-btn-secondary ax-btn-sm list-none">Edit</summary>
                      <form action={updateMaterial} className="mt-2 grid min-w-56 gap-2">
                        <input type="hidden" name="org_id" value={org} />
                        <input type="hidden" name="site_id" value={m.site_id} />
                        <input type="hidden" name="material_id" value={m.material_id} />
                        <label className="au-field-row">
                          <span className="ax-eyebrow">Name</span>
                          <input name="name" defaultValue={m.name} required maxLength={120} className={inputClass} />
                        </label>
                        <label className="au-field-row">
                          <span className="ax-eyebrow">Low-stock level ({m.unit})</span>
                          <input
                            name="threshold"
                            defaultValue={m.low_stock_threshold === null ? "" : String(m.low_stock_threshold)}
                            inputMode="decimal"
                            placeholder="No alert"
                            className={inputClass}
                          />
                        </label>
                        <button type="submit" className={buttonClass}>Save</button>
                      </form>
                    </details>
                  )
                }
              ]}
            />
            {balances.items.length >= LIMIT && <p className="mt-2 ax-empty">Showing the first {LIMIT} materials.</p>}
          </Card>

          <Card title="Add a material" id="ma-add">
            <form action={createMaterial} className="grid max-w-md gap-3">
              <input type="hidden" name="org_id" value={org} />
              <input type="hidden" name="site_id" value={site.id} />
              <label className="au-field-row">
                <span className="ax-eyebrow">Name</span>
                <input name="name" required maxLength={120} className={inputClass} />
              </label>
              <label className="au-field-row">
                <span className="ax-eyebrow">Unit</span>
                <select name="unit" required defaultValue="" className={inputClass}>
                  <option value="" disabled>Choose a unit</option>
                  {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                </select>
              </label>
              <label className="au-field-row">
                <span className="ax-eyebrow">Low-stock level (optional)</span>
                <input name="threshold" inputMode="decimal" placeholder="No alert" className={inputClass} />
              </label>
              <button type="submit" className={buttonClass}>Add material</button>
            </form>
          </Card>
        </>
      )}
    </main>
  );
}

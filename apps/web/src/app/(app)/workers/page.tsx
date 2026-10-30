import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { UUID } from "@/lib/uuid";
import { Field, buttonClass, inputClass } from "@/components/form";
import { ButtonLink } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { DataTable } from "@/components/app/data-table";
import { Notice } from "@/components/app/notice";
import { PageHead } from "@/components/app/page-head";
import { StatusTag } from "@/components/app/status-tag";
import { ImportPanel } from "./import-panel";
import { addWorker } from "./actions";

const PAGE = 200;

type WorkerRow = { id: string; code: string; full_name: string; trade: string; pay_type: string; status: string };

function isWorkerRow(r: unknown): r is WorkerRow {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return ["id", "code", "full_name", "trade", "pay_type", "status"].every((k) => typeof o[k] === "string");
}

export default async function WorkersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const org = params.org;
  if (typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");
  const pageNo = Math.max(1, Math.min(1000, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1));
  const from = (pageNo - 1) * PAGE;

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/workers?org=${org}`)}`);

  // Owners and project managers manage workers (can_manage_sites); an
  // accountant reads them to pay them (can_view_wages, ADR-011 W10).
  // RLS filters the list either way.
  const [{ data: orgRow }, { data: canManage }, { data: canWages }, { data: workers, count }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.rpc("can_manage_sites", { p_org_id: org }),
    supabase.rpc("can_view_wages", { p_org_id: org }),
    supabase
      .from("workers")
      .select("id, code, full_name, trade, pay_type, status", { count: "exact" })
      .eq("org_id", org)
      .order("code")
      .range(from, from + PAGE - 1)
  ]);
  if (!orgRow || (canManage !== true && canWages !== true)) redirect("/dashboard");

  const rows = Array.isArray(workers) ? workers.filter(isWorkerRow) : [];
  const total = typeof count === "number" ? count : rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const error = messageFor(params.error);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
      <PageHead eyebrow={orgRow.name} title="Workers" />

      {error && <Notice kind="error">{error}</Notice>}

      {canManage === true && (
        <div className="ov-columns">
          <Card title="Add a worker" id="wk-add">
            <form action={addWorker} className="space-y-3">
              <input type="hidden" name="org_id" value={org} />
              <Field label="Worker code">
                <input name="code" required maxLength={40} className={inputClass} />
              </Field>
              <Field label="Name">
                <input name="full_name" required maxLength={120} className={inputClass} />
              </Field>
              <Field label="Trade">
                <input name="trade" required maxLength={60} placeholder="mason, helper, carpenter…" className={inputClass} />
              </Field>
              <Field label="Pay type">
                <select name="pay_type" defaultValue="daily" className={inputClass}>
                  <option value="daily">Daily</option>
                  <option value="hourly">Hourly</option>
                </select>
              </Field>
              <Field label="Phone (optional)">
                <input name="phone" type="tel" maxLength={20} className={inputClass} />
              </Field>
              <button type="submit" className={buttonClass}>Add worker</button>
            </form>
          </Card>
          <Card title="Import from a file" id="wk-import">
            <ImportPanel orgId={org} />
          </Card>
        </div>
      )}

      <Card title={`Workers (${total})`} id="wk-list">
        <DataTable<WorkerRow>
          caption="Workers"
          rows={rows}
          rowKey={(w) => w.id}
          minWidth={600}
          empty="No workers yet."
          columns={[
            { key: "code", label: "Code", render: (w) => <Link href={`/workers/${w.id}?org=${org}`} className="underline">{w.code}</Link> },
            { key: "name", label: "Name", render: (w) => w.full_name },
            { key: "trade", label: "Trade", render: (w) => w.trade },
            { key: "pay", label: "Pay", render: (w) => (w.pay_type === "hourly" ? "Hourly" : "Daily") },
            { key: "status", label: "Status", render: (w) => <StatusTag tone={w.status === "active" ? "ink" : "muted"}>{w.status === "active" ? "Active" : "Inactive"}</StatusTag> }
          ]}
        />
        {pages > 1 && (
          <nav className="mt-4 flex flex-wrap items-center gap-3" aria-label="Pages">
            {pageNo > 1 && <ButtonLink href={`/workers?org=${org}&page=${pageNo - 1}`} variant="secondary">← Previous</ButtonLink>}
            <span className="ax-empty">Page {pageNo} of {pages}</span>
            {pageNo < pages && <ButtonLink href={`/workers?org=${org}&page=${pageNo + 1}`} variant="secondary">Next →</ButtonLink>}
          </nav>
        )}
      </Card>
    </main>
  );
}

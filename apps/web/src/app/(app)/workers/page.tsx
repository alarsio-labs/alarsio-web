import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { messageFor } from "@/lib/messages";
import { UUID } from "@/lib/uuid";
import { Field, Notice, buttonClass, inputClass } from "@/components/form";
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
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/dashboard" className="app-back">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">{orgRow.name} · Workers</h1>

      {error && <div className="mt-6"><Notice kind="error">{error}</Notice></div>}

      {canManage === true && (
        <div className="mt-8 grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="text-lg font-medium">Add a worker</h2>
            <form action={addWorker} className="mt-4 space-y-3">
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
          </section>
          <section>
            <h2 className="text-lg font-medium">Import from a file</h2>
            <div className="mt-4"><ImportPanel orgId={org} /></div>
          </section>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium">Workers ({total})</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No workers yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-md border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Trade</th>
                  <th className="px-3 py-2 font-medium">Pay</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td className="px-3 py-2 font-mono">
                      <Link href={`/workers/${w.id}?org=${org}`} className="underline">{w.code}</Link>
                    </td>
                    <td className="px-3 py-2">{w.full_name}</td>
                    <td className="px-3 py-2">{w.trade}</td>
                    <td className="px-3 py-2">{w.pay_type}</td>
                    <td className="px-3 py-2">{w.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-3 flex items-center gap-4 text-sm" aria-label="Pages">
            {pageNo > 1 && <Link href={`/workers?org=${org}&page=${pageNo - 1}`} className="underline">← Previous</Link>}
            <span className="text-neutral-600">Page {pageNo} of {pages}</span>
            {pageNo < pages && <Link href={`/workers?org=${org}&page=${pageNo + 1}`} className="underline">Next →</Link>}
          </nav>
        )}
      </section>
    </main>
  );
}

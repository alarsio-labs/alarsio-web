import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ImportPanel } from "./import-panel";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  const org = (await searchParams).org;
  if (typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/workers?org=${org}`)}`);

  // Managing workers is can_manage_sites (owner, project manager), the same
  // predicate the workers policies use. RLS filters the list either way.
  const [{ data: orgRow }, { data: canManage }, { data: workers }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", org).maybeSingle(),
    supabase.rpc("can_manage_sites", { p_org_id: org }),
    supabase
      .from("workers")
      .select("id, code, full_name, trade, pay_type, status")
      .eq("org_id", org)
      .order("code")
      .limit(500)
  ]);
  if (!orgRow || canManage !== true) redirect("/dashboard");

  const rows = Array.isArray(workers) ? workers.filter(isWorkerRow) : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-4 text-2xl font-semibold">{orgRow.name} · Workers</h1>

      <section className="mt-8 max-w-xl">
        <h2 className="text-lg font-medium">Import from a file</h2>
        <div className="mt-4"><ImportPanel orgId={org} /></div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Workers ({rows.length}{rows.length === 500 ? "+" : ""})</h2>
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
                    <td className="px-3 py-2 font-mono">{w.code}</td>
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
      </section>
    </main>
  );
}

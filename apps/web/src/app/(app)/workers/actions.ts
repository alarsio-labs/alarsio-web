"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID as UUID_RE, formText, workerErrorCode, workerFields } from "@/lib/workers/form";
import { MAX_IMPORT_ROWS, type ImportRow } from "@/lib/workers/roster-file";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ImportResultRow = {
  row: number;
  code: string;
  result: "created" | "updated" | "skipped" | "rejected";
  reason?: string;
};

export type ImportOutcome = { ok: true; results: ImportResultRow[] } | { ok: false; message: string };

const RESULTS = new Set(["created", "updated", "skipped", "rejected"]);

function cleanRow(value: unknown): ImportRow | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).slice(0, max) : "");
  const row: ImportRow = {
    code: str("code", 60),
    full_name: str("full_name", 200),
    trade: str("trade", 100),
    pay_type: str("pay_type", 20)
  };
  const phone = str("phone", 30);
  if (phone) row.phone = phone;
  return row;
}

function toResults(data: unknown): ImportResultRow[] {
  if (!Array.isArray(data)) return [];
  const out: ImportResultRow[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.row !== "number" || typeof o.result !== "string" || !RESULTS.has(o.result)) continue;
    out.push({
      row: o.row,
      code: typeof o.code === "string" ? o.code : "",
      result: o.result as ImportResultRow["result"],
      ...(typeof o.reason === "string" ? { reason: o.reason } : {})
    });
  }
  return out;
}

// The browser has already read the file; this sends its rows to
// import_workers() as the signed-in user. RLS and the function's own checks
// decide what is allowed; nothing here widens that.
export async function importWorkers(orgId: string, rows: unknown): Promise<ImportOutcome> {
  if (!UUID.test(orgId)) return { ok: false, message: "Unknown organisation." };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, message: "The file has no workers." };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `At most ${MAX_IMPORT_ROWS} workers per file.` };
  const clean = rows.map(cleanRow);
  if (clean.some((r) => r === null)) return { ok: false, message: "The file could not be read." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("import_workers", { p_org_id: orgId, p_rows: clean });
  if (error) {
    return {
      ok: false,
      message: error.code === "42501" ? "Only an owner or project manager can import workers." : "The import failed. Nothing was saved. Try again."
    };
  }
  revalidatePath("/workers");
  return { ok: true, results: toResults(data) };
}

export async function addWorker(form: FormData) {
  const orgId = formText(form, "org_id", 36);
  if (!UUID_RE.test(orgId)) redirect("/dashboard");
  const fields = workerFields(form);
  const code = formText(form, "code", 40);
  const back = (q: string): never => redirect(`/workers?org=${orgId}&${q}`);
  if (!code || !fields.full_name || !fields.trade || !fields.pay_type) back("error=worker_invalid");

  const supabase = await supabaseServer();
  // Plain insert under RLS (workers_insert: can_manage_sites) and the table's
  // own checks. The new id comes back through workers_select.
  const { data, error } = await supabase
    .from("workers")
    .insert({ org_id: orgId, code, ...fields })
    .select("id")
    .single();
  if (error || !data) return back(`error=${workerErrorCode(error?.code)}`);
  revalidatePath("/workers");
  redirect(`/workers/${data.id}?org=${orgId}&done=worker_added`);
}

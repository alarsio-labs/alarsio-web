"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID, formText, parseDate, parseRate, workerErrorCode, workerFields } from "@/lib/workers/form";

// Every action runs as the signed-in user. RLS, column grants and the
// database's own checks decide; these only shape input and pick a message.

function ids(form: FormData) {
  const orgId = formText(form, "org_id", 36);
  const workerId = formText(form, "worker_id", 36);
  if (!UUID.test(orgId) || !UUID.test(workerId)) redirect("/dashboard");
  const back = (q: string): never => redirect(`/workers/${workerId}?org=${orgId}&${q}`);
  return { orgId, workerId, back };
}

export async function saveWorker(form: FormData) {
  const { workerId, back } = ids(form);
  const fields = workerFields(form);
  const status = formText(form, "status", 10);
  if (!fields.full_name || !fields.trade || !fields.pay_type || (status !== "active" && status !== "inactive")) {
    back("error=worker_invalid");
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("workers")
    .update({ ...fields, status })
    .eq("id", workerId)
    .select("id");
  // RLS turns a forbidden update into 0 rows, not an error.
  if (error) back(`error=${workerErrorCode(error.code)}`);
  if (!data || data.length === 0) back("error=not_permitted");
  revalidatePath("/workers");
  back("done=worker_saved");
}

export async function addRate(form: FormData) {
  const { orgId, workerId, back } = ids(form);
  const rate = parseRate(formText(form, "rate", 20));
  const from = parseDate(formText(form, "effective_from", 10));
  if (rate === null || from === null) back("error=rate_invalid");
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("worker_wage_rates")
    .insert({ org_id: orgId, worker_id: workerId, rate, effective_from: from });
  if (error) back(error.code === "23505" ? "error=rate_same_day" : error.code === "42501" ? "error=not_permitted" : "error=rate_invalid");
  back("done=rate_added");
}

export async function assignToSite(form: FormData) {
  const { orgId, workerId, back } = ids(form);
  const siteId = formText(form, "site_id", 36);
  if (!UUID.test(siteId)) back("error=generic");
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("worker_site_assignments")
    .insert({ org_id: orgId, worker_id: workerId, site_id: siteId });
  if (error) {
    back(
      error.code === "23505" ? "error=assign_duplicate"
        : error.code === "55000" ? "error=assign_blocked"
        : error.code === "42501" ? "error=not_permitted"
        : "error=generic"
    );
  }
  back("done=assigned");
}

export async function unassign(form: FormData) {
  const { back } = ids(form);
  const assignmentId = formText(form, "assignment_id", 36);
  if (!UUID.test(assignmentId)) back("error=generic");
  const supabase = await supabaseServer();
  // The server stamps the real time and the caller (wsa_stamp_unassign).
  const { data, error } = await supabase
    .from("worker_site_assignments")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .is("unassigned_at", null)
    .select("id");
  if (error || !data || data.length === 0) back("error=not_permitted");
  back("done=unassigned");
}

export async function anonymize(form: FormData) {
  const { workerId, back } = ids(form);
  if (form.get("confirm") !== "yes") back("error=generic");
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("anonymize_worker", { p_worker_id: workerId });
  if (error) back("error=not_permitted");
  revalidatePath("/workers");
  back("done=anonymized");
}

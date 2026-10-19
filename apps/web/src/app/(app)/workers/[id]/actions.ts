"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayInIndia } from "@/lib/dates";
import type { MessageCode } from "@/lib/messages";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID, formText, parseDate, parseRate, rateDateWindow, workerErrorCode, workerFields } from "@/lib/workers/form";

// Every action runs as the signed-in user. RLS, column grants and the
// database's own checks decide; these only shape input and pick a message.
// Under RLS a forbidden update touches 0 rows without an error: that, and only
// that, is reported as "not allowed".

type Ids = { orgId: string; workerId: string };

function ids(form: FormData): Ids {
  const orgId = formText(form, "org_id", 36) ?? "";
  const workerId = formText(form, "worker_id", 36) ?? "";
  if (!UUID.test(orgId) || !UUID.test(workerId)) redirect("/dashboard");
  return { orgId, workerId };
}

function back({ orgId, workerId }: Ids, outcome: { error: MessageCode } | { done: string }): never {
  const q = "error" in outcome ? `error=${outcome.error}` : `done=${outcome.done}`;
  redirect(`/workers/${workerId}?org=${orgId}&${q}`);
}

export async function saveWorker(form: FormData) {
  const at = ids(form);
  const fields = workerFields(form);
  const status = formText(form, "status", 10);
  if (!fields || (status !== "active" && status !== "inactive")) back(at, { error: "worker_invalid" });

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("workers")
    .update({ ...fields, status })
    .eq("id", at.workerId)
    .select("id");
  if (error) back(at, { error: workerErrorCode(error.code) });
  if (!data || data.length === 0) back(at, { error: "not_permitted" });

  // An inactive worker holds no open site assignment, as anonymize_worker
  // already does, so no reader has to tell a stale roster row apart.
  if (status === "inactive") {
    const { error: closeError } = await supabase
      .from("worker_site_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("worker_id", at.workerId)
      .is("unassigned_at", null);
    if (closeError) back(at, { error: workerErrorCode(closeError.code) });
  }
  revalidatePath("/workers");
  back(at, { done: "worker_saved" });
}

export async function addRate(form: FormData) {
  const at = ids(form);
  const rate = parseRate(formText(form, "rate", 20) ?? "");
  if (rate === null) back(at, { error: "rate_invalid" });
  const from = parseDate(formText(form, "effective_from", 10) ?? "", rateDateWindow(todayInIndia()));
  if (from === null) back(at, { error: "rate_date" });

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("worker_wage_rates")
    .insert({ org_id: at.orgId, worker_id: at.workerId, rate, effective_from: from });
  if (error) {
    back(at, {
      error:
        error.code === "23505" ? "rate_same_day"
          : error.code === "23514" ? "rate_invalid"
          : error.code === "42501" ? "not_permitted"
          : "generic"
    });
  }
  back(at, { done: "rate_added" });
}

export async function assignToSite(form: FormData) {
  const at = ids(form);
  const siteId = formText(form, "site_id", 36) ?? "";
  if (!UUID.test(siteId)) back(at, { error: "generic" });

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("worker_site_assignments")
    .insert({ org_id: at.orgId, worker_id: at.workerId, site_id: siteId });
  if (error) {
    back(at, {
      error:
        error.code === "23505" ? "assign_duplicate"
          : error.code === "55000" ? "assign_blocked"
          : error.code === "42501" ? "not_permitted"
          : "generic"
    });
  }
  back(at, { done: "assigned" });
}

export async function unassign(form: FormData) {
  const at = ids(form);
  const assignmentId = formText(form, "assignment_id", 36) ?? "";
  if (!UUID.test(assignmentId)) back(at, { error: "generic" });

  const supabase = await supabaseServer();
  // The server stamps the real time and the caller (wsa_stamp_unassign).
  // Filtered by worker too, so an id posted from another worker's page is a no-op.
  const { data, error } = await supabase
    .from("worker_site_assignments")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("worker_id", at.workerId)
    .is("unassigned_at", null)
    .select("id");
  if (error) back(at, { error: workerErrorCode(error.code) });
  if (!data || data.length === 0) back(at, { error: "not_permitted" });
  back(at, { done: "unassigned" });
}

export async function anonymize(form: FormData) {
  const at = ids(form);
  if (form.get("confirm") !== "yes") back(at, { error: "generic" });
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("anonymize_worker", { p_worker_id: at.workerId });
  if (error) back(at, { error: error.code === "42501" ? "not_permitted" : "generic" });
  revalidatePath("/workers");
  back(at, { done: "anonymized" });
}

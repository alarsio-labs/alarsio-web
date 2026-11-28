"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { advanceErrorCode, cleanAdvanceInput } from "@/lib/advances/input";

// Each form carries a fresh id, so a resend is a no-op (ADR-054).

function field(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

function uuid(form: FormData, key: string): string | null {
  const v = field(form, key);
  return v !== null && UUID.test(v) ? v : null;
}

function ids(form: FormData) {
  const org = uuid(form, "org_id");
  const site = uuid(form, "site_id");
  if (org === null || site === null) redirect("/dashboard");
  return { site, back: `/advances?org=${org}&site=${site}` };
}

export async function recordAdvance(form: FormData) {
  const { site, back } = ids(form);
  const id = uuid(form, "advance_id");
  if (id === null) redirect("/dashboard");
  const worker = uuid(form, "worker_id");
  if (worker === null) redirect(`${back}&error=advance_worker`);

  const input = cleanAdvanceInput({ amount: form.get("amount"), paidOn: form.get("paid_on"), note: form.get("note") });
  if (!input.ok) redirect(`${back}&error=${input.code}`);

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("apply_worker_advance", {
    p_id: id,
    p_site_id: site,
    p_worker_id: worker,
    p_paid_on: input.value.paidOn,
    p_amount_paise: input.value.amountPaise,
    p_note: input.value.note
  });
  if (error) redirect(`${back}&error=${advanceErrorCode(error.code)}`);

  revalidatePath("/advances");
  redirect(`${back}&saved=1`);
}

// A cancel is a new row that reverses the whole advance, on the advance's own day.
export async function cancelAdvance(form: FormData) {
  const { back } = ids(form);
  const id = uuid(form, "reversal_id");
  const advance = uuid(form, "advance_id");
  if (id === null || advance === null) redirect("/dashboard");

  const supabase = await supabaseServer();
  const { data: original } = await supabase
    .from("worker_advances")
    .select("site_id, worker_id, paid_on, amount_paise")
    .eq("id", advance)
    .maybeSingle();
  if (!original) redirect(`${back}&error=advance_rule`);

  const { error } = await supabase.rpc("apply_worker_advance", {
    p_id: id,
    p_site_id: original.site_id,
    p_worker_id: original.worker_id,
    p_paid_on: original.paid_on,
    p_amount_paise: original.amount_paise,
    p_note: null,
    p_reverses_id: advance
  });
  if (error) redirect(`${back}&error=${advanceErrorCode(error.code)}`);

  revalidatePath("/advances");
  redirect(`${back}&saved=1`);
}

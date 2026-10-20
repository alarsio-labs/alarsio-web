"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { cleanAdjustmentInput, cleanPeriodInput, cleanReason, wageErrorCode } from "@/lib/wages/input";

// The only writes the wages pages make, all as the signed-in user. A period and an
// adjustment are inserted under RLS (can_view_wages); calculate, lock and reopen are
// the published functions, which check the caller themselves. Nothing here widens that,
// and no amount is ever typed in: lines are computed by the database (ADR-035).

function field(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

function orgId(form: FormData): string {
  const org = field(form, "org_id");
  if (org === null || !UUID.test(org)) redirect("/dashboard");
  return org;
}

function periodIds(form: FormData) {
  const org = orgId(form);
  const period = field(form, "period_id");
  if (period === null || !UUID.test(period)) redirect("/dashboard");
  return { org, period, back: `/wages/${period}?org=${org}` };
}

export async function createPeriod(form: FormData) {
  const org = orgId(form);
  const back = `/wages?org=${org}`;
  const input = cleanPeriodInput({ type: form.get("period_type"), start: form.get("start_date") });
  if (!input.ok) redirect(`${back}&error=${input.code}`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("wage_periods")
    .insert({ org_id: org, ...input.value })
    .select("id")
    .single();
  if (error || !data || typeof data.id !== "string") redirect(`${back}&error=${wageErrorCode(error?.code)}`);

  revalidatePath("/wages");
  redirect(`/wages/${data.id}?org=${org}&saved=1`);
}

export async function calculatePeriod(form: FormData) {
  const { period, back } = periodIds(form);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("calculate_wage_period", { p_period_id: period });
  if (error) redirect(`${back}&error=${wageErrorCode(error.code)}`);
  revalidatePath(`/wages/${period}`);
  redirect(`${back}&saved=1`);
}

export async function lockPeriod(form: FormData) {
  const { period, back } = periodIds(form);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("lock_wage_period", { p_period_id: period });
  if (error) redirect(`${back}&error=${wageErrorCode(error.code)}`);
  revalidatePath(`/wages/${period}`);
  redirect(`${back}&saved=1`);
}

export async function reopenPeriod(form: FormData) {
  const { period, back } = periodIds(form);
  const reason = cleanReason(form.get("reason"));
  if (reason === null) redirect(`${back}&error=wage_reason`);
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("reopen_wage_period", { p_period_id: period, p_reason: reason });
  if (error) redirect(`${back}&error=${wageErrorCode(error.code)}`);
  revalidatePath(`/wages/${period}`);
  redirect(`${back}&saved=1`);
}

export async function addAdjustment(form: FormData) {
  const { org, period, back } = periodIds(form);
  const worker = field(form, "worker_id");
  if (worker === null || !UUID.test(worker)) redirect(back);
  const input = cleanAdjustmentInput({ amount: form.get("amount"), reason: form.get("reason") });
  if (!input.ok) redirect(`${back}&error=${input.code}`);

  const supabase = await supabaseServer();
  const { error } = await supabase.from("wage_adjustments").insert({
    org_id: org,
    period_id: period,
    worker_id: worker,
    amount: input.value.amount,
    reason: input.value.reason
  });
  if (error) redirect(`${back}&error=${wageErrorCode(error.code)}`);
  revalidatePath(`/wages/${period}`);
  redirect(`${back}&saved=1`);
}

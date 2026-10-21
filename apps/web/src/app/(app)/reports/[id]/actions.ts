"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/reports/rows";
import { cleanReviewNote, cleanSendBackReason, reviewErrorCode, sendBackErrorCode } from "@/lib/reports/review";

// The reports pages make two writes, both through Daily Reporting's functions.
// review_daily_report checks who may review (can_review_site), refuses the
// author's own report, a draft and a sent-back one, and is a no-op on a report
// that is already reviewed.
export async function reviewReport(form: FormData) {
  const id = form.get("report_id");
  const org = form.get("org_id");
  if (typeof id !== "string" || !UUID.test(id) || typeof org !== "string" || !UUID.test(org)) {
    redirect("/dashboard");
  }
  const back = `/reports/${id}?org=${org}`;

  const note = cleanReviewNote(form.get("note"));
  if (note === "too_long") redirect(`${back}&error=review_note_long`);

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("review_daily_report", { p_report_id: id, p_note: note });
  if (error) redirect(`${back}&error=${reviewErrorCode(error.code)}`);

  revalidatePath("/reports");
  redirect(back);
}

// send_back_daily_report checks the same reviewer rules, needs a reason of 1 to
// 1000 characters, refuses a reviewed report (55000) and is a no-op on a report
// already sent back (ADR-042 D2).
export async function sendBackReport(form: FormData) {
  const id = form.get("report_id");
  const org = form.get("org_id");
  if (typeof id !== "string" || !UUID.test(id) || typeof org !== "string" || !UUID.test(org)) {
    redirect("/dashboard");
  }
  const back = `/reports/${id}?org=${org}`;

  const reason = cleanSendBackReason(form.get("reason"));
  if (reason === "missing" || reason === "too_long") redirect(`${back}&error=send_back_reason`);

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("send_back_daily_report", { p_report_id: id, p_reason: reason });
  if (error) redirect(`${back}&error=${sendBackErrorCode(error.code)}`);

  revalidatePath("/reports");
  redirect(back);
}

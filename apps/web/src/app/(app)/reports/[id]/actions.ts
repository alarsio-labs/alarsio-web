"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/reports/rows";
import { cleanReviewNote, reviewErrorCode } from "@/lib/reports/review";

// The only write the reports pages make. review_daily_report checks who may
// review (can_review_site), refuses the author's own report and a draft, and is
// a no-op on a report that is already reviewed.
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

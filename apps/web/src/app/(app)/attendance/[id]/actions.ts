"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { cleanReason, parseDecision, reviewErrorCode } from "@/lib/attendance/review";

// The only writes the attendance pages make: review_attendance_day and
// review_attendance_correction. Each checks can_review_site on a locked row,
// answers 42501 for "no such id" and "not yours", and is a no-op on a record that
// is already decided the same way. These actions decide nothing themselves.

type Review = { approve: boolean; reason: string | null };

// Reads the decision and reason from the form. Anything wrong goes back to the
// page with a fixed code, before the database is asked.
function readReview(form: FormData, back: string): Review {
  const decision = parseDecision(form.get("decision"));
  if (!decision) redirect(`${back}&error=generic`);
  const reason = cleanReason(decision, form.get("reason"));
  if (!reason.ok) redirect(`${back}&error=${reason.error}`);
  return { approve: decision === "approve", reason: reason.reason };
}

function ids(form: FormData, ...names: string[]): string[] {
  const out = [...names, "org_id"].map((n) => form.get(n));
  if (!out.every((v): v is string => typeof v === "string" && UUID.test(v))) redirect("/dashboard");
  return out as string[];
}

function finish(error: { code?: string } | null, kind: "day" | "correction", back: string): never {
  // The session ended between loading the page and pressing the button.
  if (error?.code === "28000") redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  if (error) redirect(`${back}&error=${reviewErrorCode(kind, error.code)}`);
  revalidatePath("/attendance");
  redirect(back);
}

export async function reviewDay(form: FormData) {
  const [dayId, org] = ids(form, "day_id") as [string, string];
  const back = `/attendance/${dayId}?org=${org}`;
  const { approve, reason } = readReview(form, back);

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("review_attendance_day", { p_day_id: dayId, p_approve: approve, p_reason: reason });
  finish(error, "day", back);
}

export async function reviewCorrection(form: FormData) {
  const [correctionId, dayId, org] = ids(form, "correction_id", "day_id") as [string, string, string];
  const back = `/attendance/${dayId}?org=${org}`;
  const { approve, reason } = readReview(form, back);

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("review_attendance_correction", {
    p_correction_id: correctionId,
    p_approve: approve,
    p_reason: reason
  });
  finish(error, "correction", back);
}

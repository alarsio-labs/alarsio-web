"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function acceptInvite(form: FormData) {
  const token = form.get("token");
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) redirect("/invite/invalid");

  const supabase = await supabaseServer();
  // null for unknown, expired, revoked or used: one answer for all (ADR-019, I5).
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error?.code === "PT429") redirect("/invite/invalid?reason=rate");
  if (error || typeof data !== "string") redirect("/invite/invalid");
  redirect("/dashboard");
}

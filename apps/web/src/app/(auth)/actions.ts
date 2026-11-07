"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profile";
import { safeNextPath } from "@/lib/safe-redirect";
import { publicEnv } from "@/lib/env";
import { checkNewPassword } from "@/lib/auth/password";

function text(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function back(path: string, error: string, next: string): never {
  const q = new URLSearchParams({ error });
  if (next !== "/dashboard") q.set("next", next);
  redirect(`${path}?${q.toString()}`);
}

export async function signIn(form: FormData) {
  const next = safeNextPath(form.get("next"));
  const email = text(form, "email").toLowerCase();
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  if (!email || !password) back("/sign-in", "missing_fields", next);

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    back("/sign-in", error?.code === "email_not_confirmed" ? "email_not_confirmed" : "invalid_credentials", next);
  }
  await ensureProfile(supabase, data.user);
  redirect(next);
}

export async function signUp(form: FormData) {
  const next = safeNextPath(form.get("next"));
  const fullName = text(form, "full_name").slice(0, 120);
  const email = text(form, "email").toLowerCase();
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  if (!fullName || !email || !password) back("/sign-up", "missing_fields", next);
  if (checkNewPassword(password)) back("/sign-up", "weak_password", next);
  // The agreement is checked in the form only; nothing is stored (no database change).
  if (form.get("terms") !== "on") back("/sign-up", "terms_required", next);

  const { siteUrl } = publicEnv();
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`
    }
  });
  // Same outcome whether or not the email is already registered, so the form
  // does not reveal who has an account.
  if (error && error.code !== "user_already_exists") back("/sign-up", "sign_up_failed", next);
  // Keep `next` (an invite, for example) so a "send again" from the next page lands there too.
  redirect(next === "/dashboard" ? "/check-email" : `/check-email?next=${encodeURIComponent(next)}`);
}

/**
 * Sends the sign-up confirmation email again, from "Check your email" or "Link expired".
 * It answers the same whether or not the address has an account (the rule signUp follows),
 * except when Supabase refuses because the last email went out too recently.
 */
export async function resendConfirmation(form: FormData) {
  const next = safeNextPath(form.get("next"));
  const from = form.get("from") === "expired" ? "/link-expired" : "/check-email";
  const email = text(form, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) back(from, "missing_fields", next);

  const { siteUrl } = publicEnv();
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}` }
  });
  if (error?.code === "over_email_send_rate_limit") back(from, "resend_rate", next);
  const q = new URLSearchParams({ sent: "1" });
  if (next !== "/dashboard") q.set("next", next);
  redirect(`/check-email?${q.toString()}`);
}

export async function requestPasswordReset(form: FormData) {
  const email = text(form, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) back("/forgot-password", "missing_fields", "/dashboard");

  const { siteUrl } = publicEnv();
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent("/update-password")}`
  });
  // Same page whether or not the address has an account, and even if sending failed,
  // so the form does not reveal who has an account (the same rule as signUp).
  redirect("/check-email?for=reset");
}

export async function updatePassword(form: FormData) {
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  const confirm = typeof form.get("confirm") === "string" ? (form.get("confirm") as string) : "";
  const problem = checkNewPassword(password, confirm);
  if (problem) back("/update-password", problem, "/dashboard");

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/link-expired?for=reset");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) back("/update-password", "update_password_failed", "/dashboard");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

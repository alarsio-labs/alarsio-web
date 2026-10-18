"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profile";
import { safeNextPath } from "@/lib/safe-redirect";
import { publicEnv } from "@/lib/env";

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
  if (password.length < 8) back("/sign-up", "weak_password", next);

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
  redirect("/check-email");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

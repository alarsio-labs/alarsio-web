import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// profiles has one row per user, created by the user themselves (RLS:
// id = auth.uid()). The name comes from what they typed at sign-up.
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<void> {
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;
  const raw: unknown = user.user_metadata?.full_name;
  const fullName = typeof raw === "string" && raw.trim().length > 0 ? raw.trim().slice(0, 120) : "New user";
  await supabase.from("profiles").insert({ id: user.id, full_name: fullName });
}

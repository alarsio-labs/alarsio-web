"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { NAME_MESSAGE, parseDisplayName } from "@/lib/profile-name";

export type NameState = { status: "idle" } | { status: "saved"; name: string } | { status: "error"; message: string };

// Saves the signed-in person's own display name (pre-launch audit issue 6: anyone created
// without a name stayed "New user"). RLS is the boundary: profiles_update lets a user change
// only their own row, and only full_name is granted (identity_org_membership migration).
export async function updateMyName(_prev: NameState, form: FormData): Promise<NameState> {
  const parsed = parseDisplayName(form.get("full_name"));
  if (!parsed.ok) return { status: "error", message: NAME_MESSAGE[parsed.code] };

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: NAME_MESSAGE.name_failed };

  const { data, error } = await supabase.from("profiles").update({ full_name: parsed.name }).eq("id", user.id).select("id");
  if (error) return { status: "error", message: NAME_MESSAGE.name_failed };
  if (!data || data.length === 0) {
    // No profile row yet (it is normally made at sign-in): create it with this name.
    const { error: insertError } = await supabase.from("profiles").insert({ id: user.id, full_name: parsed.name });
    if (insertError) return { status: "error", message: NAME_MESSAGE.name_failed };
  }
  revalidatePath("/", "layout");
  return { status: "saved", name: parsed.name };
}

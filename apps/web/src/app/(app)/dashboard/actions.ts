"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function createOrganization(form: FormData) {
  const raw = form.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";
  if (name.length < 1 || name.length > 120) redirect("/dashboard?error=org_name");

  const supabase = await supabaseServer();
  // create_organization() makes the caller the first owner (ADR-006).
  const { error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) redirect("/dashboard?error=org_failed");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { parseOrgForm } from "@/lib/dashboard/org-form";

export async function createOrganization(form: FormData) {
  const parsed = parseOrgForm(form);
  if (!parsed.ok) redirect(`/dashboard?error=${parsed.code}`);

  const supabase = await supabaseServer();
  // create_organization() makes the caller the first owner (ADR-006) and refuses an
  // unknown timezone (22023), which lands on org_failed like any other refusal.
  const { error } = await supabase.rpc("create_organization", { p_name: parsed.name, p_timezone: parsed.timezone });
  if (error) redirect("/dashboard?error=org_failed");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

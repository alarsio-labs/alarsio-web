"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { cleanMaterialInput, materialErrorCode } from "@/lib/materials/input";

// The only writes the materials page makes, to the materials table as the
// signed-in user. RLS decides who may (can_manage_sites, plus has_site_access
// for a new one), the CHECKs hold the limits, and nothing here widens that.
// Only the name and the low-stock level can change once a material exists:
// the unit, the site and the organisation are fixed (ADR-015), and the update
// grant covers only those two columns.

function field(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

function ids(form: FormData) {
  const org = field(form, "org_id");
  const site = field(form, "site_id");
  if (org === null || site === null || !UUID.test(org) || !UUID.test(site)) redirect("/dashboard");
  return { org, site, back: `/materials?org=${org}&site=${site}` };
}

export async function createMaterial(form: FormData) {
  const { org, site, back } = ids(form);

  const input = cleanMaterialInput(
    { name: form.get("name"), unit: form.get("unit"), threshold: form.get("threshold") },
    { unit: true },
  );
  if (!input.ok) redirect(`${back}&error=${input.code}`);

  const supabase = await supabaseServer();
  const { error } = await supabase.from("materials").insert({
    org_id: org,
    site_id: site,
    name: input.value.name,
    unit: input.value.unit,
    low_stock_threshold: input.value.threshold,
  });
  if (error) redirect(`${back}&error=${materialErrorCode(error.code)}`);

  revalidatePath("/materials");
  redirect(`${back}&saved=1`);
}

export async function updateMaterial(form: FormData) {
  const { back } = ids(form);
  const id = field(form, "material_id");
  if (id === null || !UUID.test(id)) redirect("/dashboard");

  // The unit is never read: it is fixed once the material exists.
  const input = cleanMaterialInput({ name: form.get("name"), threshold: form.get("threshold") }, { unit: false });
  if (!input.ok) redirect(`${back}&error=${input.code}`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("materials")
    .update({ name: input.value.name, low_stock_threshold: input.value.threshold })
    .eq("id", id)
    .select("id");
  if (error) redirect(`${back}&error=${materialErrorCode(error.code)}`);
  // RLS hides a row the caller may not edit, so an update that matched nothing
  // reads as "changed zero rows", not as an error.
  if (!Array.isArray(data) || data.length === 0) redirect(`${back}&error=material_not_found`);

  revalidatePath("/materials");
  redirect(`${back}&saved=1`);
}

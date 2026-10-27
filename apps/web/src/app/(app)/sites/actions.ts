"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";
import { cleanSiteInput, isSiteStatus, siteErrorCode } from "@/lib/sites/input";
import { assignmentErrorCode } from "@/lib/sites/assignments";

// The only writes the sites pages make, to the sites and site_assignments tables
// (and archive_site()) as the signed-in user. RLS decides who may (can_manage_sites), the CHECKs hold
// the limits, and nothing here widens that. An update names `id` and `org_id`
// both, so a changed hidden field cannot reach another organisation's site.
// `archived` is reached only through archive_site(); an archived site is hidden
// from UPDATE by its policy, so a stale form on one changes 0 rows.

function field(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

function orgId(form: FormData): string {
  const org = field(form, "org_id");
  if (org === null || !UUID.test(org)) redirect("/dashboard");
  return org;
}

function siteIds(form: FormData) {
  const org = orgId(form);
  const site = field(form, "site_id");
  if (site === null || !UUID.test(site)) redirect("/dashboard");
  return { org, site, back: `/sites/${site}?org=${org}` };
}

export async function createSite(form: FormData) {
  const org = orgId(form);
  const back = `/sites/new?org=${org}`;

  const input = cleanSiteInput({
    name: form.get("name"),
    address: form.get("address"),
    latitude: form.get("latitude"),
    longitude: form.get("longitude"),
    radius: form.get("radius")
  });
  if (!input.ok) redirect(`${back}&error=${input.code}`);

  // No .select() on the insert: has_site_access is STABLE, so reading the new
  // row back inside the same statement can fail RLS (ADR-034 W3). The status is
  // left to its default, 'planned'.
  const supabase = await supabaseServer();
  const { error } = await supabase.from("sites").insert({ org_id: org, ...input.value });
  if (error) redirect(`${back}&error=${siteErrorCode(error.code)}`);

  revalidatePath("/sites");
  redirect(`/sites?org=${org}&saved=1`);
}

export async function updateSite(form: FormData) {
  const { org, site, back } = siteIds(form);

  const input = cleanSiteInput({
    name: form.get("name"),
    address: form.get("address"),
    latitude: form.get("latitude"),
    longitude: form.get("longitude"),
    radius: form.get("radius")
  });
  if (!input.ok) redirect(`${back}&error=${input.code}`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("sites")
    .update(input.value)
    .eq("id", site)
    .eq("org_id", org)
    .select("id");
  if (error) redirect(`${back}&error=${siteErrorCode(error.code)}`);
  // RLS hides a row the caller may not edit (an archived site, another
  // organisation's), so an update that matched nothing reads as 0 rows.
  if (!Array.isArray(data) || data.length === 0) redirect(`${back}&error=site_not_allowed`);

  revalidatePath("/sites");
  redirect(`${back}&saved=1`);
}

export async function setSiteStatus(form: FormData) {
  const { org, site, back } = siteIds(form);

  const status = field(form, "status");
  if (!isSiteStatus(status)) redirect(`${back}&error=site_status`);

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("sites")
    .update({ status })
    .eq("id", site)
    .eq("org_id", org)
    .select("id");
  if (error) redirect(`${back}&error=${siteErrorCode(error.code)}`);
  if (!Array.isArray(data) || data.length === 0) redirect(`${back}&error=site_not_allowed`);

  revalidatePath("/sites");
  redirect(`${back}&saved=1`);
}

// Reached only from the confirm view (?confirm=archive). The function checks
// the caller itself, closes every open assignment, and does nothing on a site
// that is already archived, so a second click is not an error.
export async function archiveSite(form: FormData) {
  const { org, site, back } = siteIds(form);

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("archive_site", { p_site_id: site });
  if (error) redirect(`${back}&error=${siteErrorCode(error.code)}`);

  revalidatePath("/sites");
  redirect(`/sites?org=${org}&archived=1`);
}

// Assign a member to the site. Only the three columns the grant allows; who
// assigned and when come from the table's defaults. No .select(), for the reason
// in createSite. The person is a member of the organisation by the table's own
// foreign key, and a duplicate open assignment is the unique index's 23505.
export async function assignSupervisor(form: FormData) {
  const { org, site, back } = siteIds(form);
  const user = field(form, "user_id");
  if (user === null || !UUID.test(user)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const { error } = await supabase.from("site_assignments").insert({ org_id: org, site_id: site, user_id: user });
  if (error) redirect(`${back}&error=${assignmentErrorCode(error.code)}`);

  revalidatePath("/sites");
  redirect(`${back}&saved=1`);
}

// Remove closes the row: the client sends only a non-null unassigned_at and the
// trigger stamps the real time and the caller. Rows are never deleted. A row that
// is already closed, or on an archived site, is hidden from UPDATE, so 0 rows.
export async function removeSupervisor(form: FormData) {
  const { org, site, back } = siteIds(form);
  const assignment = field(form, "assignment_id");
  if (assignment === null || !UUID.test(assignment)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("site_assignments")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("id", assignment)
    .eq("site_id", site)
    .eq("org_id", org)
    .select("id");
  if (error) redirect(`${back}&error=${assignmentErrorCode(error.code)}`);
  if (!Array.isArray(data) || data.length === 0) redirect(`${back}&error=assign_not_allowed`);

  revalidatePath("/sites");
  redirect(`${back}&saved=1`);
}

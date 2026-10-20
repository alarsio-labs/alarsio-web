import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { UUID } from "@/lib/uuid";

// What every sites page does first: the organisation in the URL is a UUID, the
// viewer is signed in, and Identity's can_manage_sites says they are an owner or
// project manager of it. That is presentation: RLS and archive_site() repeat the
// check and are the boundary. The pages read no Identity table (ADR-034 W8).
export async function requireSiteManager(org: unknown, nextFor: (org: string) => string) {
  if (typeof org !== "string" || !UUID.test(org)) redirect("/dashboard");

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextFor(org))}`);

  const { data: canManage, error } = await supabase.rpc("can_manage_sites", { p_org_id: org });
  // A failed check is not "not a manager": say so, rather than hide it.
  if (error) redirect("/dashboard?error=generic");
  if (canManage !== true) redirect("/dashboard");

  return { supabase, org };
}

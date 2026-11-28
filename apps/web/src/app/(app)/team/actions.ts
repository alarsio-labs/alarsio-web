"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAppRole, type AppRole } from "@alarsio/types";
import { supabaseServer } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { buildInviteEmail, inviteLink } from "@/lib/email/invite-email";
import { sendMail } from "@/lib/email/send";

const INVITE_VALID_HOURS = 72; // matches create_invite() (ADR-019, I2)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type InviteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; email: string; link: string; emailed: boolean };

function errorFor(code: string | undefined): string {
  switch (code) {
    case "42501":
      return "Only an owner of this organisation can invite.";
    case "PT409":
      return "That person is already a member. To change their role, use the Members list.";
    case "23505":
      return "That email already has an open invite. Resend it from the Invites list, or revoke it first.";
    case "22023":
      return "Enter a valid email address.";
    case "PT429":
      return "Too many invites in the last hour. Try again later.";
    default:
      return "Could not create the invite. Try again.";
  }
}

export async function createInvite(_prev: InviteState, form: FormData): Promise<InviteState> {
  const orgId = form.get("org_id");
  const emailRaw = form.get("email");
  const role = form.get("role");
  if (typeof orgId !== "string" || !UUID.test(orgId)) return { status: "error", message: "Unknown organisation." };
  if (typeof emailRaw !== "string" || emailRaw.trim().length === 0) return { status: "error", message: "Enter an email address." };
  if (!isAppRole(role)) return { status: "error", message: "Choose a role." };
  const email = emailRaw.trim().toLowerCase();

  const supabase = await supabaseServer();
  const { data: token, error } = await supabase.rpc("create_invite", { p_org_id: orgId, p_email: email, p_role: role });
  if (error || typeof token !== "string") return { status: "error", message: errorFor(error?.code) };
  return emailInvite(supabase, { orgId, email, role, token });
}

// Builds the link and tries to email it. The link is returned once, to this owner's
// browser only, and never put in a URL.
async function emailInvite(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  { orgId, email, role, token }: { orgId: string; email: string; role: AppRole; token: string }
): Promise<InviteState> {
  const link = inviteLink(publicEnv().siteUrl, token);

  const [{ data: org }, { data: auth }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.auth.getUser()
  ]);
  const { data: profile } = auth.user
    ? await supabase.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle()
    : { data: null };
  const orgName = typeof org?.name === "string" ? org.name : "your team";
  const inviterName = typeof profile?.full_name === "string" ? profile.full_name : "Your team owner";

  const emailed = await sendMail({
    to: email,
    ...buildInviteEmail({ orgName, inviterName, role, link, validHours: INVITE_VALID_HOURS })
  });

  revalidatePath("/team");
  return { status: "sent", email, link, emailed };
}

// The invite's own email and role are read back, not taken from the form, so the new
// link goes to the address the owner first chose. The old link stops working.
export async function resendInvite(_prev: InviteState, form: FormData): Promise<InviteState> {
  const id = form.get("invite_id");
  const orgId = form.get("org_id");
  if (typeof id !== "string" || !UUID.test(id) || typeof orgId !== "string" || !UUID.test(orgId)) {
    return { status: "error", message: "Unknown invite." };
  }

  const supabase = await supabaseServer();
  const { data: old } = await supabase.from("invites").select("email, role").eq("id", id).maybeSingle();
  if (!old || typeof old.email !== "string" || !isAppRole(old.role)) return { status: "error", message: "Unknown invite." };

  const { data: token, error } = await supabase.rpc("resend_invite", { p_invite_id: id });
  if (error || typeof token !== "string") return { status: "error", message: errorFor(error?.code) };
  return emailInvite(supabase, { orgId, email: old.email, role: old.role, token });
}

export async function changeRole(form: FormData) {
  const orgId = form.get("org_id");
  const userId = form.get("user_id");
  const role = form.get("role");
  if (typeof orgId !== "string" || !UUID.test(orgId) || typeof userId !== "string" || !UUID.test(userId) || !isAppRole(role)) return;
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("change_member_role", { p_org_id: orgId, p_user_id: userId, p_role: role });
  revalidatePath("/team");
  if (error) redirect(`/team?org=${orgId}&error=${error.code === "PT422" ? "last_owner" : "role_change_failed"}`);
}

export async function revokeInvite(form: FormData) {
  const id = form.get("invite_id");
  const orgId = form.get("org_id");
  if (typeof id !== "string" || !UUID.test(id) || typeof orgId !== "string" || !UUID.test(orgId)) return;
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("revoke_invite", { p_invite_id: id });
  revalidatePath("/team");
  if (error) redirect(`/team?org=${orgId}&error=revoke_failed`);
}

"use server";

import { revalidatePath } from "next/cache";
import { isAppRole } from "@alarsio/types";
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
    case "23505":
      return "That person is already a member, or already has an open invite.";
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
  // The link is returned once, to this owner's browser only, and never put in a URL.
  return { status: "sent", email, link, emailed };
}

export async function revokeInvite(form: FormData) {
  const id = form.get("invite_id");
  if (typeof id !== "string" || !UUID.test(id)) return;
  const supabase = await supabaseServer();
  await supabase.rpc("revoke_invite", { p_invite_id: id });
  revalidatePath("/team");
}

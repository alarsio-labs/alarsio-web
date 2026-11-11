// Builds the invite email. Pure, so it is unit tested without a mail server.
import { emailLayout } from "./layout";

/** The name a profile gets before its owner sets one (lib/profile.ts). */
const NO_NAME = "New user";

const ROLE_LABEL = {
  owner: "an owner",
  project_manager: "a project manager",
  supervisor: "a supervisor",
  accountant: "an accountant"
} as const;

export type InviteRole = keyof typeof ROLE_LABEL;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inviteLink(siteUrl: string, token: string): string {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("invalid invite token");
  return `${siteUrl.replace(/\/+$/, "")}/invite/${token}`;
}

export function buildInviteEmail(input: {
  orgName: string;
  inviterName: string;
  role: InviteRole;
  link: string;
  validHours: number;
}) {
  // Names are typed by users, so strip line breaks from the subject.
  const org = input.orgName.replace(/[\r\n]+/g, " ").trim();
  const rawInviter = input.inviterName.replace(/[\r\n]+/g, " ").trim();
  // A profile with no name yet reads "New user"; saying that in an invite looks broken.
  const inviter = rawInviter && rawInviter !== NO_NAME ? rawInviter : null;
  const role = ROLE_LABEL[input.role];
  const subject = inviter ? `${inviter} invited you to ${org} on Alarsio` : `You're invited to join ${org} on Alarsio`;
  const lead = inviter ? `${inviter} invited you to join ${org} on Alarsio as ${role}.` : `You're invited to join ${org} on Alarsio as ${role}.`;
  const expiry = `The link works once and expires in ${input.validHours} hours. Anyone with the link can use it, so do not forward it.`;
  const text = [lead, "", `Open this link to join: ${input.link}`, "", expiry].join("\n");

  const who = inviter ? `<strong>${escapeHtml(inviter)}</strong> invited you` : "You're invited";
  const html = emailLayout({
    preheader: `Join ${escapeHtml(org)} on Alarsio as ${role}.`,
    heading: `Join ${escapeHtml(org)}`,
    bodyHtml: `${who} to join <strong>${escapeHtml(org)}</strong> on Alarsio as ${role}.<br><br>Alarsio keeps site attendance, daily reports and materials in one place, even where the phone has no signal.`,
    button: { label: `Join ${escapeHtml(org)}`, href: escapeHtml(input.link) },
    footnote: expiry
  });
  return { subject, text, html };
}

// Builds the invite email. Pure, so it is unit tested without a mail server.

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
  const inviter = input.inviterName.replace(/[\r\n]+/g, " ").trim();
  const role = ROLE_LABEL[input.role];
  const subject = `${inviter} invited you to ${org} on Alarsio`;
  const text = [
    `${inviter} invited you to join ${org} on Alarsio as ${role}.`,
    "",
    `Open this link to join: ${input.link}`,
    "",
    `The link works once and expires in ${input.validHours} hours. Anyone with the link can use it, so do not forward it.`
  ].join("\n");
  const html = `<p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(org)}</strong> on Alarsio as ${role}.</p>
<p><a href="${escapeHtml(input.link)}">Join ${escapeHtml(org)}</a></p>
<p style="color:#555">The link works once and expires in ${input.validHours} hours. Anyone with the link can use it, so do not forward it.</p>`;
  return { subject, text, html };
}

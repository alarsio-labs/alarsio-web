import { cookies } from "next/headers";

// The invite a person opened before signing up or in. `next` carries it through
// sign-up and the confirmation email, but a sign-in that lost `next` (opened by hand,
// or a confirm link that dropped it) lands on /dashboard, which offers a new
// organisation. With this cookie the dashboard sends them back to the invite instead.
//
// The token is the same secret the invite URL already holds; accept_invite still checks
// the email, the expiry and single use (ADR-019). httpOnly, so page scripts never see it.

export const INVITE_COOKIE = "alarsio_invite";
/** As long as an invite lives: create_invite sets expires_at to now() + 72 hours. */
export const INVITE_COOKIE_MAX_AGE = 72 * 60 * 60;

const TOKEN = /^[0-9a-f]{64}$/;

/** The token when `next` is exactly /invite/<token>, else null. */
export function inviteTokenFromNext(next: string): string | null {
  const m = /^\/invite\/([^/?#]+)$/.exec(next);
  return m?.[1] && TOKEN.test(m[1]) ? m[1] : null;
}

/** Where a person with no organisation should go: their remembered invite, if any. */
export function pendingInvitePath(cookieValue: string | undefined): string | null {
  return cookieValue && TOKEN.test(cookieValue) ? `/invite/${cookieValue}` : null;
}

/** Remembers the invite when `next` is one. Call from a server action. */
export async function rememberInvite(next: string): Promise<void> {
  const token = inviteTokenFromNext(next);
  if (!token) return;
  (await cookies()).set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE
  });
}

/** Forgets the invite once it has been used or refused. Call from a server action. */
export async function forgetInvite(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}

/** The remembered invite's path, read in a server component. */
export async function rememberedInvitePath(): Promise<string | null> {
  return pendingInvitePath((await cookies()).get(INVITE_COOKIE)?.value);
}

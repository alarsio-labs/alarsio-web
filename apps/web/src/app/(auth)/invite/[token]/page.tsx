import type { Metadata } from "next";
import { getAuthUser } from "@/lib/supabase/server";
import { AuthFoot, AuthNotice, AuthScene, AuthTitle } from "@/components/auth/scene";
import { SubmitButton } from "@/components/auth/submit-button";
import { PendingLink } from "@/components/auth/pending-link";
import { IconBadge, InviteVisual } from "@/components/auth/visuals";
import { acceptInvite } from "./actions";

// The token is in this URL, so never send it on as a Referer.
export const metadata: Metadata = { title: "Invitation", referrer: "no-referrer", robots: { index: false } };

export default async function InvitePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { reason } = await searchParams;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return (
      <AuthScene tone="alert" visual={<InviteVisual />} mobileTop={<IconBadge kind="alert" />}>
        <AuthTitle title="Invite link not valid" />
        <AuthNotice kind="error">
          {reason === "rate"
            ? "Too many attempts. Wait an hour and try again."
            : "This invite link is invalid, expired, revoked or already used. Ask your owner for a new one."}
        </AuthNotice>
        <AuthFoot>
          <p>
            <PendingLink href="/dashboard">Go to your dashboard</PendingLink>
          </p>
        </AuthFoot>
      </AuthScene>
    );
  }

  const {
    data: { user }
  } = await getAuthUser();
  const next = encodeURIComponent(`/invite/${token}`);

  if (!user) {
    return (
      <AuthScene tone="invite" visual={<InviteVisual />} mobileTop={<IconBadge kind="invite" />}>
        <AuthTitle title="You're invited" sub="Your team uses Alarsio for attendance, daily reports and materials. Sign in or create an account to join; you come back here after." />
        <div className="sx-actions">
          <PendingLink href={`/sign-up?next=${next}`} className="sx-btn sx-btn-red">Create an account</PendingLink>
          <PendingLink href={`/sign-in?next=${next}`} className="sx-btn sx-btn-line">I already have an account</PendingLink>
        </div>
        <AuthFoot>
          <p>Use the same email address the invite was sent to.</p>
        </AuthFoot>
      </AuthScene>
    );
  }

  return (
    <AuthScene tone="invite" visual={<InviteVisual />} mobileTop={<IconBadge kind="invite" />}>
      <AuthTitle title="Join your team" sub={<>You are signed in as <b>{user.email}</b>. Join the organisation that invited you.</>} />
      <form action={acceptInvite}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton label="Join the team" pendingLabel="Joining…" />
      </form>
    </AuthScene>
  );
}

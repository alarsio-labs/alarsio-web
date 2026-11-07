import type { Metadata } from "next";
import { requestPasswordReset, resendConfirmation } from "../actions";
import { AuthField, AuthFoot, AuthNotice, AuthScene, AuthTitle } from "@/components/auth/scene";
import { SubmitButton } from "@/components/auth/submit-button";
import { PendingLink } from "@/components/auth/pending-link";
import { IconBadge, InboxVisual } from "@/components/auth/visuals";
import { messageFor } from "@/lib/messages";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reset = params.for === "reset";
  const sent = params.sent === "1";
  const next = safeNextPath(params.next);
  const error = messageFor(params.error);
  const signInHref = next === "/dashboard" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;

  return (
    <AuthScene tone="mail" visual={<InboxVisual reset={reset} />} mobileTop={<IconBadge kind="mail" />}>
      <AuthTitle
        title="Check your email"
        sub={
          reset
            ? "If an account uses that address, a link to set a new password is on its way."
            : "We sent you a link to confirm your email. It usually arrives within a minute."
        }
      />
      {sent && <AuthNotice kind="success">Sent again. Use the newest email: older links stop working.</AuthNotice>}
      {error && <AuthNotice kind="error">{error}</AuthNotice>}
      <ol className="sx-list">
        <li>Open the email from Alarsio, on any device.</li>
        <li>{reset ? "Tap the link and choose a new password." : "Tap the link to confirm your address."}</li>
        <li>{reset ? "You are signed in with the new password." : "Come back and sign in. An invite takes you straight to your team."}</li>
      </ol>

      <p className="sx-divider">No email? Check spam, or send it again</p>
      <form action={reset ? requestPasswordReset : resendConfirmation}>
        <input type="hidden" name="next" value={next} />
        <AuthField label="Your email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@company.in" />
        <SubmitButton label="Send the email again" pendingLabel="Sending…" variant="ink" />
      </form>
      <AuthFoot>
        <p>
          <PendingLink href={signInHref}>Back to sign in</PendingLink>
        </p>
      </AuthFoot>
    </AuthScene>
  );
}

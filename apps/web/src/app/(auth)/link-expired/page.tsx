import type { Metadata } from "next";
import { requestPasswordReset, resendConfirmation } from "../actions";
import { AuthField, AuthFoot, AuthNotice, AuthScene, AuthTitle } from "@/components/auth/scene";
import { SubmitButton } from "@/components/auth/submit-button";
import { PendingLink } from "@/components/auth/pending-link";
import { ExpiredVisual, IconBadge } from "@/components/auth/visuals";
import { messageFor } from "@/lib/messages";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Link expired", robots: { index: false } };

// Where /auth/confirm sends a link it cannot use (lib/auth/expired.ts): used, expired, or
// opened twice. It asks for the email and sends a new link of the same kind.
export default async function LinkExpiredPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reset = params.for === "reset";
  const next = safeNextPath(params.next);
  const error = messageFor(params.error);
  const signInHref = next === "/dashboard" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;

  return (
    <AuthScene tone="alert" visual={<ExpiredVisual />} mobileTop={<IconBadge kind="alert" />}>
      <AuthTitle
        title="This link has expired"
        sub={
          reset
            ? "Password links work once and only for a short time. Ask for a new one below."
            : "Email links work once and only for a short time. If you already confirmed, just sign in."
        }
      />
      {error ? (
        <AuthNotice kind="error">{error}</AuthNotice>
      ) : (
        <AuthNotice kind="warn">Nothing is lost. Your account and records are safe.</AuthNotice>
      )}
      <form action={reset ? requestPasswordReset : resendConfirmation}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="from" value="expired" />
        <AuthField label="Your email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@company.in" />
        <SubmitButton label={reset ? "Send a new reset link" : "Send a new link"} pendingLabel="Sending a new link…" />
      </form>
      <AuthFoot>
        <p>
          Already confirmed? <PendingLink href={signInHref}>Sign in</PendingLink>
        </p>
      </AuthFoot>
    </AuthScene>
  );
}

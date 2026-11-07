import type { Metadata } from "next";
import { requestPasswordReset } from "../actions";
import { AuthField, AuthFoot, AuthNotice, AuthScene, AuthTitle } from "@/components/auth/scene";
import { SubmitButton } from "@/components/auth/submit-button";
import { PendingLink } from "@/components/auth/pending-link";
import { IconBadge, KeyVisual } from "@/components/auth/visuals";
import { messageFor } from "@/lib/messages";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = messageFor(params.error);

  return (
    <AuthScene tone="key" visual={<KeyVisual />} mobileTop={<IconBadge kind="key" />}>
      <AuthTitle title="Forgot your password?" sub="Enter your email and we send you a link to set a new one." />
      {error && <AuthNotice kind="error">{error}</AuthNotice>}
      <form action={requestPasswordReset}>
        <AuthField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@company.in" />
        <SubmitButton label="Send reset link" pendingLabel="Sending link…" />
      </form>
      <AuthFoot>
        <p>
          Remembered it? <PendingLink href="/sign-in">Back to sign in</PendingLink>
        </p>
      </AuthFoot>
    </AuthScene>
  );
}

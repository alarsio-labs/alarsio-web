import type { Metadata } from "next";
import { signIn } from "../actions";
import { AuthField, AuthFoot, AuthNotice, AuthScene, AuthTitle } from "@/components/auth/scene";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { PendingLink } from "@/components/auth/pending-link";
import { StatusChip, TodayVisual } from "@/components/auth/visuals";
import { messageFor } from "@/lib/messages";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = messageFor(params.error);
  const signUpHref = next === "/dashboard" ? "/sign-up" : `/sign-up?next=${encodeURIComponent(next)}`;
  const invited = next.startsWith("/invite/");

  return (
    <AuthScene tone="warm" visual={<TodayVisual />} mobileTop={<StatusChip />}>
      <AuthTitle
        title={invited ? "Sign in to join" : "Sign in"}
        sub={invited ? "Sign in, and you come straight back to your invite." : "Welcome back. Use the email your invite came to."}
      />
      {error && <AuthNotice kind="error">{error}</AuthNotice>}
      <form action={signIn}>
        <input type="hidden" name="next" value={next} />
        <AuthField label="Email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.in" required />
        <PasswordField label="Password" name="password" autoComplete="current-password" />
        <div className="sx-row">
          <PendingLink href="/forgot-password" className="sx-link-red">Forgot password?</PendingLink>
        </div>
        <SubmitButton label="Sign in" pendingLabel="Signing in…" />
      </form>
      <AuthFoot>
        <p>
          New to Alarsio? <PendingLink href={signUpHref}>Create an account</PendingLink>
        </p>
      </AuthFoot>
    </AuthScene>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { signUp } from "../actions";
import { AuthField, AuthFoot, AuthNotice, AuthScene, AuthTitle } from "@/components/auth/scene";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { PendingLink } from "@/components/auth/pending-link";
import { PathVisual, StepStrip } from "@/components/auth/visuals";
import { messageFor } from "@/lib/messages";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = messageFor(params.error);
  const signInHref = next === "/dashboard" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;
  const invited = next.startsWith("/invite/");

  return (
    <AuthScene tone="fresh" visual={<PathVisual />} mobileTop={<StepStrip at={1} />}>
      <AuthTitle
        title={invited ? "Create your account" : "Start your free pilot"}
        sub={invited ? "Then you join the team that invited you." : "Create your account first. Next you confirm your email and name your company."}
      />
      {error && <AuthNotice kind="error">{error}</AuthNotice>}
      <form action={signUp}>
        <input type="hidden" name="next" value={next} />
        <AuthField label="Full name" name="full_name" autoComplete="name" required maxLength={120} placeholder="Ravi Deshmukh" />
        <AuthField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@company.in" />
        <PasswordField label="Password" name="password" autoComplete="new-password" minLength={8} meter />
        <label className="sx-check">
          <input type="checkbox" name="terms" required />
          <span>
            I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
          </span>
        </label>
        <SubmitButton label="Create account" pendingLabel="Creating your account…" />
      </form>
      <AuthFoot>
        <p>
          Have an account? <PendingLink href={signInHref}>Sign in</PendingLink>
        </p>
        {!invited && <p>Joining a team? Open the invite link your owner sent you.</p>}
      </AuthFoot>
    </AuthScene>
  );
}

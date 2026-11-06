import type { Metadata } from "next";
import Link from "next/link";
import { signUp } from "../actions";
import { AuthField, AuthFoot, AuthHeading, AuthNotice, authButton, authInput } from "@/components/v2-form";
import { PasswordInput } from "@/components/password-input";
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

  return (
    <>
      <AuthHeading eyebrow="Join the pilot" title="Create an account" />
      <form action={signUp}>
        {error && <AuthNotice kind="error">{error}</AuthNotice>}
        <input type="hidden" name="next" value={next} />
        <AuthField label="Full name">
          <input name="full_name" autoComplete="name" required maxLength={120} className={authInput} />
        </AuthField>
        <AuthField label="Email">
          <input name="email" type="email" autoComplete="email" required className={authInput} />
        </AuthField>
        <PasswordInput label="Password" name="password" autoComplete="new-password" hint="At least 8 characters" minLength={8} />
        <label className="au-check">
          <input type="checkbox" name="terms" required />
          <span>
            I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>
          </span>
        </label>
        <p className="lp-mono lp-muted au-hint">Create account → name your company → add your first site</p>
        <button type="submit" className={authButton}>Create account</button>
      </form>
      <AuthFoot>
        Have an account? <Link href={signInHref}>Sign in</Link>
        <br />
        Joining a team? Open the invite link your owner sent you.
      </AuthFoot>
    </>
  );
}

import Link from "next/link";
import { signUp } from "../actions";
import { AuthField, AuthFoot, AuthHeading, AuthNotice, authButton, authInput } from "@/components/v2-form";
import { messageFor } from "@/lib/messages";
import { safeNextPath } from "@/lib/safe-redirect";

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
        <AuthField label="Password" hint="At least 8 characters">
          <input name="password" type="password" autoComplete="new-password" required minLength={8} className={authInput} />
        </AuthField>
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

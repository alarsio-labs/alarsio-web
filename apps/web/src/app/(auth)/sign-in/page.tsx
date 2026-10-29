import Link from "next/link";
import { signIn } from "../actions";
import { AuthField, AuthFoot, AuthHeading, AuthNotice, authButton, authInput } from "../ui";
import { messageFor } from "@/lib/messages";
import { safeNextPath } from "@/lib/safe-redirect";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = messageFor(params.error);
  const signUpHref = next === "/dashboard" ? "/sign-up" : `/sign-up?next=${encodeURIComponent(next)}`;

  return (
    <>
      <AuthHeading eyebrow="Welcome back" title="Sign in" />
      <form action={signIn}>
        {error && <AuthNotice kind="error">{error}</AuthNotice>}
        <input type="hidden" name="next" value={next} />
        <AuthField label="Email">
          <input name="email" type="email" autoComplete="email" required className={authInput} />
        </AuthField>
        <AuthField label="Password">
          <input name="password" type="password" autoComplete="current-password" required className={authInput} />
        </AuthField>
        <button type="submit" className={authButton}>Sign in</button>
      </form>
      <AuthFoot>
        New here? <Link href={signUpHref}>Create an account</Link>
      </AuthFoot>
    </>
  );
}

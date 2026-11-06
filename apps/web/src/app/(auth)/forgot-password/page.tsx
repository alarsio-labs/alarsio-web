import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "../actions";
import { AuthField, AuthFoot, AuthHeading, AuthNotice, authButton, authInput } from "@/components/v2-form";
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
    <>
      <AuthHeading eyebrow="Forgot your password?" title="Reset password" />
      <form action={requestPasswordReset}>
        {error && <AuthNotice kind="error">{error}</AuthNotice>}
        <AuthField label="Email" hint="We will email you a link to set a new password.">
          <input name="email" type="email" autoComplete="email" required className={authInput} />
        </AuthField>
        <button type="submit" className={authButton}>Send reset link</button>
      </form>
      <AuthFoot>
        <Link href="/sign-in">Back to sign in</Link>
      </AuthFoot>
    </>
  );
}

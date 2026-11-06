import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updatePassword } from "../actions";
import { AuthHeading, AuthNotice, authButton } from "@/components/v2-form";
import { PasswordInput } from "@/components/password-input";
import { messageFor } from "@/lib/messages";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set a new password" };

export default async function UpdatePasswordPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The reset link signs the person in (/auth/confirm). Without that session there is
  // nothing to update, so send them to ask for a new link.
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/forgot-password?error=link_invalid");

  const params = await searchParams;
  const error = messageFor(params.error);

  return (
    <>
      <AuthHeading eyebrow="Almost done" title="Set a new password" />
      <form action={updatePassword}>
        {error && <AuthNotice kind="error">{error}</AuthNotice>}
        <PasswordInput label="New password" name="password" autoComplete="new-password" hint="At least 8 characters" minLength={8} />
        <PasswordInput label="Confirm new password" name="confirm" autoComplete="new-password" minLength={8} />
        <button type="submit" className={authButton}>Save new password</button>
      </form>
    </>
  );
}

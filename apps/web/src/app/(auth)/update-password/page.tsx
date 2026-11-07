import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { updatePassword } from "../actions";
import { AuthNotice, AuthScene, AuthTitle } from "@/components/auth/scene";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { IconBadge, KeyVisual } from "@/components/auth/visuals";
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
  if (!data.user) redirect("/link-expired?for=reset");

  const params = await searchParams;
  const error = messageFor(params.error);

  return (
    <AuthScene tone="key" visual={<KeyVisual lock />} mobileTop={<IconBadge kind="lock" />}>
      <AuthTitle title="Set a new password" sub={<>For <b>{data.user.email}</b>. You stay signed in after this.</>} />
      {error && <AuthNotice kind="error">{error}</AuthNotice>}
      <form action={updatePassword}>
        <PasswordField label="New password" name="password" autoComplete="new-password" minLength={8} meter />
        <PasswordField label="Type it again" name="confirm" autoComplete="new-password" minLength={8} />
        <SubmitButton label="Save new password" pendingLabel="Saving…" />
      </form>
    </AuthScene>
  );
}

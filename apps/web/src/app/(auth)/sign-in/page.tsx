import Link from "next/link";
import { signIn } from "../actions";
import { AuthCard, Field, Notice, buttonClass, inputClass } from "@/components/form";
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
    <AuthCard title="Sign in">
      <form action={signIn} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <input type="hidden" name="next" value={next} />
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        <button type="submit" className={buttonClass}>Sign in</button>
      </form>
      <p className="mt-6 text-sm text-neutral-600">
        New here? <Link href={signUpHref} className="underline">Create an account</Link>
      </p>
    </AuthCard>
  );
}

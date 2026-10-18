import Link from "next/link";
import { signUp } from "../actions";
import { AuthCard, Field, Notice, buttonClass, inputClass } from "@/components/form";
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
    <AuthCard title="Create an account">
      <form action={signUp} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <input type="hidden" name="next" value={next} />
        <Field label="Full name">
          <input name="full_name" autoComplete="name" required maxLength={120} className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="Password (at least 8 characters)">
          <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
        </Field>
        <button type="submit" className={buttonClass}>Create account</button>
      </form>
      <p className="mt-6 text-sm text-neutral-600">
        Have an account? <Link href={signInHref} className="underline">Sign in</Link>
      </p>
    </AuthCard>
  );
}

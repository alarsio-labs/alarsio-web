import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { AuthCard, Notice, buttonClass } from "@/components/form";
import { acceptInvite } from "./actions";

// The token is in this URL, so never send it on as a Referer.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default async function InvitePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { reason } = await searchParams;

  if (!/^[0-9a-f]{64}$/.test(token)) {
    return (
      <AuthCard title="Invite link not valid">
        <Notice kind="error">
          {reason === "rate"
            ? "Too many attempts. Wait an hour and try again."
            : "This invite link is invalid, expired, revoked or already used. Ask for a new one."}
        </Notice>
        <p className="mt-6 text-sm"><Link href="/dashboard" className="underline">Go to dashboard</Link></p>
      </AuthCard>
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const next = encodeURIComponent(`/invite/${token}`);

  if (!user) {
    return (
      <AuthCard title="You're invited">
        <p className="text-neutral-700">Sign in or create an account to join. You will come back here after.</p>
        <div className="mt-6 space-y-3">
          <Link href={`/sign-in?next=${next}`} className={`${buttonClass} block text-center`}>Sign in</Link>
          <Link href={`/sign-up?next=${next}`} className="block text-center text-sm underline">Create an account</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="You're invited">
      <p className="text-neutral-700">Join the organisation that invited you, as {user.email}.</p>
      <form action={acceptInvite} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={buttonClass}>Join</button>
      </form>
    </AuthCard>
  );
}

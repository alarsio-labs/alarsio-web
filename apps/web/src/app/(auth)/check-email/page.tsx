import type { Metadata } from "next";
import Link from "next/link";
import { AuthFoot, AuthHeading } from "@/components/v2-form";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reset = params.for === "reset";
  return (
    <>
      <AuthHeading eyebrow="One more step" title="Check your email" />
      <p className="au-body">
        {reset
          ? "If an account exists for that address, we've sent a reset link. Open it on any device to set a new password."
          : "We sent a confirmation link. Open it on any device to finish, then sign in."}
      </p>
      <AuthFoot>
        <Link href="/sign-in">Back to sign in</Link>
      </AuthFoot>
    </>
  );
}

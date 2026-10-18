import Link from "next/link";
import { AuthCard } from "@/components/form";

export default function CheckEmailPage() {
  return (
    <AuthCard title="Check your email">
      <p className="text-neutral-700">
        We sent a confirmation link. Open it on any device to finish, then sign in.
      </p>
      <p className="mt-6 text-sm">
        <Link href="/sign-in" className="underline">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

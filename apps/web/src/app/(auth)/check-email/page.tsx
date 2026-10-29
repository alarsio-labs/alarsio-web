import Link from "next/link";
import { AuthFoot, AuthHeading } from "@/components/v2-form";

export default function CheckEmailPage() {
  return (
    <>
      <AuthHeading eyebrow="One more step" title="Check your email" />
      <p className="au-body">We sent a confirmation link. Open it on any device to finish, then sign in.</p>
      <AuthFoot>
        <Link href="/sign-in">Back to sign in</Link>
      </AuthFoot>
    </>
  );
}

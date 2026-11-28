import { cookies } from "next/headers";

// The address just used to sign up. Confirmation is on, so sign-up gives no session to read
// it from. "Check your email" shows it, so the person need not type it again to resend.
// httpOnly, so page scripts never see it.

export const SIGN_UP_EMAIL_COOKIE = "alarsio_signup_email";
export const SIGN_UP_EMAIL_MAX_AGE = 60 * 60;

/** Remembers the sign-up address. Call from a server action. */
export async function rememberSignUpEmail(email: string): Promise<void> {
  (await cookies()).set(SIGN_UP_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIGN_UP_EMAIL_MAX_AGE
  });
}

/** The remembered sign-up address, read in a server component. */
export async function rememberedSignUpEmail(): Promise<string | null> {
  return (await cookies()).get(SIGN_UP_EMAIL_COOKIE)?.value ?? null;
}

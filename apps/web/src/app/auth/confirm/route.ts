import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profile";
import { safeNextPath } from "@/lib/safe-redirect";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change", "magiclink"];

// The verification link lands here. The Supabase email template must link to
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=...
// so a link opened on a different device from the sign-up still works.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const fail = new URL("/sign-in?error=link_invalid", request.url);

  if (!tokenHash || !type || !(OTP_TYPES as readonly string[]).includes(type)) {
    return NextResponse.redirect(fail);
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
  if (error || !data.user) return NextResponse.redirect(fail);

  await ensureProfile(supabase, data.user);
  return NextResponse.redirect(new URL(next, request.url));
}

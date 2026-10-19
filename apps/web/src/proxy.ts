import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SIGNED_IN_ONLY = ["/dashboard", "/team", "/reports", "/workers"];

// Refreshes the Supabase session cookie on every page request, and sends a
// signed-out visitor on a signed-in-only page to sign in. This is a
// convenience, not the boundary: RLS decides what any request can read.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // The export download is a POST whose form holds the organisation; the
  // route sends a signed-out caller back to that organisation's export page.
  const ownSignIn = path === "/export/download";
  if (!user && !ownSignIn && SIGNED_IN_ONLY.some((p) => path === p || path.startsWith(p + "/"))) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    signIn.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"]
};

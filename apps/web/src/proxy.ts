import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// #140 added /wages and /export, which redirected only by themselves before.
export const SIGNED_IN_ONLY = ["/dashboard", "/team", "/reports", "/workers", "/materials", "/sites", "/attendance", "/overview", "/wages", "/export"];

// Refreshes the Supabase session cookie on every page request, and sends a
// signed-out visitor on a signed-in-only page to sign in. This is a
// convenience, not the boundary: RLS decides what any request can read.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // The export download is a POST whose form holds the organisation; the
  // route sends a signed-out caller back to that organisation's export page.
  const ownSignIn = path === "/export/download";
  const signedInOnly = !ownSignIn && SIGNED_IN_ONLY.some((p) => path === p || path.startsWith(p + "/"));

  // No Supabase session cookie: nobody is signed in and there is nothing to refresh,
  // so skip the auth client entirely. Most visitors to the public pages take this path.
  if (!hasSessionCookie(request)) return signedInOnly ? toSignIn(request, path) : NextResponse.next({ request });

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

  // getClaims() verifies the session JWT locally when the project signs with
  // asymmetric keys, and only then falls back to a round trip to Auth; getUser()
  // always made that round trip, before every page. It refreshes an expired session
  // the same way. The page still checks the user itself, so this is a hint only.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  // A signed-in visitor on / goes to their dashboard. Done here, not in the page,
  // so the landing page itself reads no cookies and can be served static from the CDN.
  if (user && path === "/") {
    const dash = request.nextUrl.clone();
    dash.pathname = "/dashboard";
    dash.search = "";
    const to = NextResponse.redirect(dash);
    // Keep a session cookie getClaims() just refreshed.
    for (const c of response.cookies.getAll()) to.cookies.set(c);
    return to;
  }
  if (!user && signedInOnly) return toSignIn(request, path);
  return response;
}

// Supabase keeps the session in sb-<project-ref>-auth-token, split into .0, .1 … when large.
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

function toSignIn(request: NextRequest, path: string) {
  const signIn = request.nextUrl.clone();
  signIn.pathname = "/sign-in";
  signIn.search = "";
  signIn.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"]
};

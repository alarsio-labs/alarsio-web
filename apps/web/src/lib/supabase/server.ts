import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

// A Supabase client acting as the signed-in user, from their session cookie.
// Use one per request; never share it between requests.
export async function supabaseServer() {
  // cookies() first: it marks the route as per-request, so a build without env
  // vars never tries to prerender a signed-in page.
  const cookieStore = await cookies();
  const { url, key } = publicEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session on the next request instead.
        }
      }
    }
  });
}

// The signed-in user, checked with Supabase Auth once per server render. The (app)
// layout and the page render in the same request and used to call getUser() each,
// one network round trip apiece; React's cache() shares the one answer. Same shape
// as supabase.auth.getUser(). Outside a render (route handlers, actions) cache() is a
// pass-through, so it is no worse there.
export const getAuthUser = cache(async () => (await supabaseServer()).auth.getUser());

// The signed-in user's memberships with each organisation's name, read once per server
// render: the (app) layout draws the frame from them and the dashboard picks the home page
// from the same rows. null when nobody is signed in. Raw rows: callers pass them to
// toMemberships() (lib/dashboard/memberships.ts).
export const getMembershipRows = cache(async () => {
  const {
    data: { user }
  } = await getAuthUser();
  if (!user) return null;
  const { data } = await (await supabaseServer())
    .from("memberships")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id);
  return data;
});

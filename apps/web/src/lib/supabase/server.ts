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

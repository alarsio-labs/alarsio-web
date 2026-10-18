// Public Supabase settings. The publishable key is safe in the browser: every
// query still runs as the signed-in user under RLS. The service-role key is
// never read anywhere in this app.
export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url || !key || !siteUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SITE_URL. Copy .env.example to apps/web/.env.local."
    );
  }
  return { url, key, siteUrl: siteUrl.replace(/\/+$/, "") };
}

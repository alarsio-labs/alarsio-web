import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// Crawler hint only. Access control is RLS and the sign-in check, never this file.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard", "/overview", "/attendance", "/sites", "/materials", "/reports",
        "/workers", "/wages", "/team", "/export", "/sign-in", "/sign-up", "/check-email",
        "/invite/", "/auth/"
      ]
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}

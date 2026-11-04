import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// Only the public landing page is indexable today. Add a page here when it ships.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl, changeFrequency: "monthly", priority: 1 }];
}

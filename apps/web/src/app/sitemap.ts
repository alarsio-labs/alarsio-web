import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

// Only public pages are indexable. Add a page here when it ships.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "monthly", priority: 1 },
    { url: `${siteUrl}/demo`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/download`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/about`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.3 }
  ];
}

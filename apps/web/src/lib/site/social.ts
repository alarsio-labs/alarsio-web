// Alarsio's public social accounts, shown in the site footer (docs/DESIGN.md, "Public frame").
// These are public addresses, so they live here rather than in a deploy setting. Keep each link
// free of a query string: a copied share link often carries a tracking id that does not belong.

export type SocialId = "linkedin" | "x" | "instagram";
export type SocialLink = { id: SocialId; label: string; href: string };

export const SOCIAL_LINKS: SocialLink[] = [
  { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/company/alarsio" },
  { id: "x", label: "X", href: "https://x.com/alarsiotech" },
  { id: "instagram", label: "Instagram", href: "https://www.instagram.com/alarsio.team" }
];

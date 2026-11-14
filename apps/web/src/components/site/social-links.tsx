import type { ReactNode } from "react";
import { SOCIAL_LINKS, type SocialId } from "@/lib/site/social";

// "Connect with us on:" and one round link per account, in the public footer. The icons are drawn
// here (no icon library), in the footer's cream, and are hidden from screen readers: each link's
// own label names the account and says it opens a new tab.

const ICONS: Record<SocialId, ReactNode> = {
  linkedin: (
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
  ),
  x: (
    <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z" />
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.2" cy="6.8" r="1.2" />
    </>
  )
};

export function SocialLinks() {
  return (
    <div className="lp-social">
      <p className="lp-social-label">Connect with us on:</p>
      <ul className="lp-social-list">
        {SOCIAL_LINKS.map((l) => (
          <li key={l.id}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Alarsio on ${l.label} (opens in a new tab)`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                {ICONS[l.id]}
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

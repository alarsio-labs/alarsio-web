import Link from "next/link";
import { CTA } from "@/lib/landing/content";

// The pieces every public page shares (docs/DESIGN.md "Info pages"): the wordmark, the two
// header actions and the site footer. The landing page keeps its own section nav and footer CTA.

const SITE_LINKS = [
  ["/about", "About"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"]
] as const;

export function Wordmark() {
  return (
    <Link href="/" className="lp-display lp-wordmark" aria-label="Alarsio, home">
      Alar<span>sio</span>
    </Link>
  );
}

/** "Sign in" and "Join the pilot", from CTA so the label is the same on every page. */
export function HeadActions() {
  return (
    <div className="lp-head-actions">
      <Link href={CTA.secondary.href} className="lp-btn lp-btn-line lp-mono">{CTA.secondary.label}</Link>
      <Link href={CTA.primary.href} className="lp-btn lp-btn-ink lp-mono">{CTA.primary.label}</Link>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-sitefoot">
      <div className="lp-sitefoot-in">
        <Wordmark />
        <nav aria-label="Footer" className="lp-sitefoot-links">
          {SITE_LINKS.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <div className="lp-sitefoot-base">
          <span>Offline-first site records for construction contractors in India</span>
          <span>© {new Date().getFullYear()} Alarsio. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

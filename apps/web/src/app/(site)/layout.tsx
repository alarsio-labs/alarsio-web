import type { ReactNode } from "react";
import Link from "next/link";
import { anton, mono } from "../fonts";
import "../landing.css";
import "./site.css";

export const SITE_LINKS = [
  ["/about", "About"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"]
] as const;

function Wordmark() {
  return (
    <Link href="/" className="lp-display lp-wordmark" aria-label="Alarsio, home">
      Alar<span>sio</span>
    </Link>
  );
}

// Shared frame for the public information pages. Static: no session lookup, no motion.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`lp ${anton.variable} ${mono.variable}`}>
      <header className="lp-head">
        <Wordmark />
        <nav aria-label="Main" className="lp-nav lp-mono">
          {SITE_LINKS.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <div className="lp-head-actions">
          <Link href="/sign-in" className="lp-btn lp-btn-line lp-mono">Sign in</Link>
          <Link href="/sign-up" className="lp-btn lp-btn-ink lp-mono">Get started</Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="lp-sitefoot">
        <Wordmark />
        <nav aria-label="Footer" className="lp-sitefoot-links lp-mono">
          {SITE_LINKS.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <div className="lp-sitefoot-base lp-mono">
          <span>Offline-first site records for construction contractors in India</span>
          <span>© {new Date().getFullYear()} Alarsio</span>
        </div>
      </footer>
    </div>
  );
}

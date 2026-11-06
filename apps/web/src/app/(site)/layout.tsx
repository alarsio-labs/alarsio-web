import type { ReactNode } from "react";
import Link from "next/link";
import { HeadActions, SiteFooter, Wordmark } from "@/components/site/public-frame";
import { anton, mono } from "../fonts";
import "../landing.css";
import "./site.css";

// Shared frame for the public information pages. Static: no session lookup, no motion.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`lp lp-site ${anton.variable} ${mono.variable}`}>
      <header className="lp-head">
        <Wordmark />
        <nav aria-label="Main" className="lp-nav lp-mono">
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <HeadActions />
      </header>

      <main id="main" tabIndex={-1}>{children}</main>

      <SiteFooter />
    </div>
  );
}

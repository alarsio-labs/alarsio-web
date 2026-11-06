import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink } from "@/components/site/doc";
import { PublicHeader, SiteFooter } from "@/components/site/public-frame";
import { anton, mono } from "./fonts";
import "./landing.css";
import "./(site)/site.css";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

// Any address that does not exist. Shown in the public frame; Next sets the 404 status.
export default function NotFound() {
  return (
    <div className={`lp lp-site ${anton.variable} ${mono.variable}`}>
      <PublicHeader />
      <main id="main" tabIndex={-1} className="nf-main">
        <p className="lp-mono lp-muted">Error 404</p>
        <h1 className="ds-title">Page not found</h1>
        <p className="ds-sub">That address does not exist, or it has moved.</p>
        <div className="nf-actions">
          <Link href="/" className="lp-btn lp-btn-ink lp-mono">Home</Link>
          <Link href="/dashboard" className="lp-btn lp-btn-line lp-mono">Dashboard</Link>
        </div>
        <p className="ds-sub">
          Still stuck? Write to <ContactLink />.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

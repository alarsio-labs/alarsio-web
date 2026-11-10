import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink } from "@/components/site/doc";
import { PageHero } from "@/components/site/page-hero";
import { PublicHeader, SiteFooter } from "@/components/site/public-frame";
import { anton, mono } from "./fonts";
import "./landing.css";
import "./home.css";
import "./(site)/site.css";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

// Any address that does not exist. Shown in the public frame, in the About look (docs/DESIGN.md 2b-i);
// Next sets the 404 status.
export default function NotFound() {
  return (
    <div className={`lp lp-site ${anton.variable} ${mono.variable}`}>
      <PublicHeader />
      <main id="main" tabIndex={-1}>
        <div className="hm">
          <PageHero crumb="Page not found" eyebrow="Error 404" title="Page not found" lede="That address does not exist, or it has moved.">
            <div className="hm-actions">
              <Link href="/" className="lp-pill lp-pill-ink">Home</Link>
              <Link href="/dashboard" className="lp-pill lp-pill-line">Dashboard</Link>
            </div>
            <p className="hm-section-lede pg-help">
              Still stuck? Write to <ContactLink />.
            </p>
          </PageHero>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

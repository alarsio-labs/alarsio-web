"use client";

import Link from "next/link";
import { ContactLink } from "@/components/site/doc";
import { PageHero } from "@/components/site/page-hero";
import { PublicHeader } from "@/components/site/public-frame";
import { anton, mono } from "./fonts";
import "./landing.css";
import "./home.css";
import "./(site)/site.css";

// A page threw while rendering. The error is neither logged nor shown here: its message can hold
// internal detail, and the server already records it. In the About look (docs/DESIGN.md 2b-i).
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={`lp lp-site ${anton.variable} ${mono.variable}`}>
      <PublicHeader />
      <main id="main" tabIndex={-1}>
        <div className="hm">
          <PageHero crumb="Error" eyebrow="Error" title="Something went wrong" lede="Try again, or go back to the start.">
            <div className="hm-actions">
              <button type="button" className="lp-pill lp-pill-ink" onClick={() => reset()}>Try again</button>
              <Link href="/" className="lp-pill lp-pill-line">Home</Link>
            </div>
            <p className="hm-section-lede pg-help">
              If it keeps happening, write to <ContactLink />.
            </p>
          </PageHero>
        </div>
      </main>
    </div>
  );
}

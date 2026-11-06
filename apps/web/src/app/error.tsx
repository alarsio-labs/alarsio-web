"use client";

import Link from "next/link";
import { ContactLink } from "@/components/site/doc";
import { HeadActions, Wordmark } from "@/components/site/public-frame";
import { anton, mono } from "./fonts";
import "./landing.css";
import "./(site)/site.css";

// A page threw while rendering. The error is neither logged nor shown here: its message can hold
// internal detail, and the server already records it.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={`lp lp-site ${anton.variable} ${mono.variable}`}>
      <header className="lp-head">
        <Wordmark />
        <HeadActions />
      </header>
      <main id="main" tabIndex={-1} className="nf-main">
        <p className="lp-mono lp-muted">Error</p>
        <h1 className="ds-title">Something went wrong</h1>
        <p className="ds-sub">Try again, or go back to the start.</p>
        <div className="nf-actions">
          <button type="button" className="lp-btn lp-btn-ink lp-mono" onClick={() => reset()}>Try again</button>
          <Link href="/" className="lp-btn lp-btn-line lp-mono">Home</Link>
        </div>
        <p className="ds-sub">
          If it keeps happening, write to <ContactLink />.
        </p>
      </main>
    </div>
  );
}

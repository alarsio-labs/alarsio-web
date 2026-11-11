import Link from "next/link";
import { CTA } from "@/lib/landing/content";

// The home page's red closing band, shared by About, Download and Contact (docs/DESIGN.md 2b-i).
// The copy is CTA in lib/landing/content.ts, so every page asks the same thing in the same words.
export function ClosingCta() {
  return (
    <section className="hm-cta" aria-labelledby="closing-cta-title">
      <div className="hm-wrap">
        <h2 id="closing-cta-title" className="lp-display hm-cta-title">{CTA.title}</h2>
        <p className="hm-cta-body">{CTA.body}</p>
        <div className="hm-actions">
          <Link href={CTA.primary.href} className="lp-pill lp-pill-ink">{CTA.primary.label} →</Link>
          <Link href={CTA.pilot.href} className="lp-pill lp-pill-line">{CTA.pilot.label}</Link>
        </div>
        <p className="hm-note">{CTA.note}</p>
      </div>
    </section>
  );
}

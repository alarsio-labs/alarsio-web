import type { ReactNode } from "react";
import Link from "next/link";
import { Eyebrow } from "./eyebrow";

// The top band of every public page after the home page (docs/DESIGN.md section 2b-i), in the About
// look: a breadcrumb, the red "( eyebrow )", the Anton headline, a lede, and room for buttons or facts.
// Styles: .hm-* in app/home.css, .pg-* in app/(site)/site.css.
export function PageHero({
  crumb,
  eyebrow,
  title,
  lede,
  meta,
  children
}: {
  crumb: string;
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <section className="hm-band pg-hero" aria-labelledby="page-title">
      <div className="hm-wrap">
        <nav aria-label="Breadcrumb">
          <ol className="pg-crumbs">
            <li><Link href="/">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{crumb}</li>
          </ol>
        </nav>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 id="page-title" className="lp-display hm-h1">{title}</h1>
        {lede ? <p className="hm-lede">{lede}</p> : null}
        {meta ? <p className="hm-note">{meta}</p> : null}
        {children}
      </div>
    </section>
  );
}

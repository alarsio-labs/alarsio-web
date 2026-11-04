import type { ReactNode } from "react";
import Link from "next/link";

// Set NEXT_PUBLIC_CONTACT_EMAIL in the deploy settings. No address is hard-coded.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

/** The contact email as a link, or a link to the Contact page while it is unset. */
export function ContactLink() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <Link href="/contact">our Contact page</Link>;
}

/** Breadcrumbs, title and a line under it: the band at the top of every info page. */
export function PageHead({ crumb, title, sub, meta }: { crumb: string; title: string; sub?: string; meta?: string }) {
  return (
    <header className="ds-head">
      <div className="ds-head-in">
        <nav aria-label="Breadcrumb">
          <ol className="ds-crumbs">
            <li><Link href="/">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{crumb}</li>
          </ol>
        </nav>
        <h1 className="ds-title">{title}</h1>
        {sub ? <p className="ds-sub">{sub}</p> : null}
        {meta ? <p className="ds-meta">{meta}</p> : null}
      </div>
    </header>
  );
}

export type DocSection = { id: string; title: string; body: ReactNode };

/** A long document (Privacy, Terms): numbered sections with a contents list beside them. */
export function LegalDoc({ intro, sections }: { intro?: ReactNode; sections: DocSection[] }) {
  return (
    <div className="ds-body">
      <aside className="ds-toc">
        <nav aria-label="On this page">
          <p className="ds-toc-title">On this page</p>
          <ol>
            {sections.map((s, i) => (
              <li key={s.id}><a href={`#${s.id}`}>{i + 1}. {s.title}</a></li>
            ))}
          </ol>
        </nav>
      </aside>
      <article className="ds-article">
        {intro ? <section><div className="ds-lead">{intro}</div></section> : null}
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`}>{i + 1}. {s.title}</h2>
            {s.body}
          </section>
        ))}
      </article>
    </div>
  );
}

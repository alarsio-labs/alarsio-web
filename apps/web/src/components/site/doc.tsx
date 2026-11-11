import type { ReactNode } from "react";
import Link from "next/link";

import { CONTACT_EMAIL } from "@/lib/site/contact";

// One source for the address: lib/site/contact.ts.
export { CONTACT_EMAIL };

/** The contact email as a link, or a link to the Contact page while it is unset. */
export function ContactLink() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <Link href="/contact">our Contact page</Link>;
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

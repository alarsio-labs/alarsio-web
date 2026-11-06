import Link from "next/link";
import { CONTACT_EMAIL, CONTACT_WHATSAPP, whatsAppHref } from "@/lib/site/contact";
import { FOOTER_COLUMNS } from "@/lib/site/nav";
import { SiteHeader } from "./site-header";
import { Wordmark } from "./wordmark";

// The pieces every public page shares (docs/DESIGN.md v2.1, "Public frame"): the header with
// its full-screen menu, and the dark four-column footer.

export { Wordmark };

/** The public header, with the WhatsApp link (when configured) passed to the menu. */
export function PublicHeader() {
  return <SiteHeader whatsApp={whatsAppHref(CONTACT_WHATSAPP)} />;
}

export function SiteFooter() {
  const whatsApp = whatsAppHref(CONTACT_WHATSAPP);
  return (
    <footer className="lp-sitefoot">
      <div className="lp-sitefoot-in">
        <div className="lp-sitefoot-top">
          <div>
            <Wordmark />
            <p className="lp-sitefoot-tag">Offline-first site records for construction contractors in India.</p>
          </div>
          <nav aria-label="Footer" className="lp-sitefoot-cols">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="lp-sitefoot-col">
                <h2>{col.title}</h2>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
                  ))}
                  {col.title === "Company" && whatsApp && (
                    <li><a href={whatsApp} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
                  )}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="lp-sitefoot-base">
          <span>© {new Date().getFullYear()} Alarsio. All rights reserved.</span>
          {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
        </div>
      </div>
    </footer>
  );
}

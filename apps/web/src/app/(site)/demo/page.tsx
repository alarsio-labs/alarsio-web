import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/page-hero";
import { EnquiryForm } from "@/components/site/enquiry-form";
import { CONTACT_PHONE, CONTACT_WHATSAPP, displayPhone, telHref, whatsAppMessageHref } from "@/lib/site/contact";
import { REPLY_PROMISE, WHATSAPP_HELLO } from "@/lib/site/enquiry";

export const metadata: Metadata = {
  title: "Book a Demo",
  description:
    "Tell us about your sites and we'll show you Alarsio on a short call. Attendance, daily reports, materials and wages for contractors running 2 to 20 sites.",
  alternates: { canonical: "/demo" }
};

const NEXT_STEPS = [
  { title: `We reply within ${REPLY_PROMISE.within}`, body: "On WhatsApp or by phone, any day of the week." },
  { title: "A short demo on your phone", body: "We show you a site day: check-in, the register, the daily report and the wage sheet." },
  { title: "We set up your first site with you", body: "Your sites, your team and your wage rates, so your supervisor can start the next morning." },
  { title: "Free during the pilot", body: "No card needed. Your data is yours to download at any time." }
];

// In the About look (docs/DESIGN.md 2b-i): the hero, then the form beside "What happens next".
// The form itself (components/site/enquiry-form.tsx, .ef-* in site.css) is unchanged.
export default function DemoPage() {
  const whatsApp = whatsAppMessageHref(CONTACT_WHATSAPP, WHATSAPP_HELLO);
  const call = telHref(CONTACT_PHONE);

  return (
    <div className="hm">
      <PageHero
        crumb="Book a demo"
        eyebrow="Free during the pilot"
        title="Book a demo"
        lede="Tell us a little about your sites. We'll call or WhatsApp you, show you Alarsio and set up your first site with you."
      />
      <section className="hm-band hm-paper" aria-label="Book a demo">
      <div className="hm-wrap ef-layout">
        <section className="ef-card" aria-labelledby="ef-title">
          <h2 id="ef-title" className="ef-title">Your details</h2>
          <EnquiryForm whatsApp={whatsApp} call={call} />
        </section>

        <aside className="ef-side" aria-labelledby="ef-next">
          <h2 id="ef-next">What happens next</h2>
          <ol className="ef-steps">
            {NEXT_STEPS.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>

          {whatsApp || call ? (
            <div className="ef-direct">
              <h3>Prefer to talk now?</h3>
              <div className="ef-direct-links">
                {whatsApp ? (
                  <a className="lp-pill lp-pill-line" href={whatsApp} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
                ) : null}
                {call && CONTACT_PHONE ? (
                  <a className="lp-pill lp-pill-line" href={call}>Call {displayPhone(CONTACT_PHONE)}</a>
                ) : null}
              </div>
              {call ? <p className="ef-hours">Calls answered {REPLY_PROMISE.callHours}.</p> : null}
            </div>
          ) : null}

          <p className="ef-signup">
            Rather set it up yourself? <Link href="/sign-up">Start a free pilot</Link>.
          </p>
        </aside>
      </div>
      </section>
    </div>
  );
}

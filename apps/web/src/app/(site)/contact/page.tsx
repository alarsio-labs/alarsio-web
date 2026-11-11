import type { Metadata } from "next";
import Link from "next/link";
import { ClosingCta } from "@/components/site/closing-cta";
import { Eyebrow } from "@/components/site/eyebrow";
import { PageHero } from "@/components/site/page-hero";
import { REPLY_PROMISE } from "@/lib/site/enquiry";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_WHATSAPP, displayPhone, telHref, whatsAppHref } from "@/lib/site/contact";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Contact Alarsio for a pilot on your sites, help with your account, or privacy requests.",
  alternates: { canonical: "/contact" }
};

function Mail({ subject, label }: { subject: string; label: string }) {
  if (!CONTACT_EMAIL) return null;
  return (
    <a className="pg-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}>
      {label} →
    </a>
  );
}

const TOPICS: { title: string; body: string; subject: string; label: string; href?: string }[] = [
  {
    title: "Sales and pilots",
    body: "Want to try Alarsio on your sites? Book a demo and we'll call or WhatsApp you, then set up your first site with you.",
    subject: "Pilot enquiry",
    label: "Book a demo",
    href: "/demo"
  },
  {
    title: "Customer support",
    body: "Need help with your account? Include the email you signed up with and your company name. Never send your password.",
    subject: "Support request",
    label: "Get help"
  },
  {
    title: "Privacy and data requests",
    body: "To access, correct or delete personal data, or to raise a grievance, write to us from the email on your account.",
    subject: "Privacy request",
    label: "Send a request"
  }
];

const n = (i: number) => String(i + 1).padStart(2, "0");

// In the About look (docs/DESIGN.md 2b-i): hero, the three topics, the ways to reach us on a dark band,
// "Before you write", then the closing band. Email, WhatsApp and phone show only when configured.
export default function ContactPage() {
  const whatsApp = whatsAppHref(CONTACT_WHATSAPP);
  const call = telHref(CONTACT_PHONE);
  return (
    <div className="hm">
      <PageHero
        crumb="Contact Us"
        eyebrow="Contact"
        title="Contact us"
        lede="We're here to help. Choose the topic that fits best and a member of our team will get back to you."
      />

      <section className="hm-band hm-paper" aria-labelledby="topics">
        <div className="hm-wrap">
          <Eyebrow>How can we help?</Eyebrow>
          <h2 id="topics" className="lp-display hm-h2">Pick a topic.</h2>
          <ol className="hm-grid hm-grid-3">
            {TOPICS.map((t, i) => (
              <li key={t.title} className="hm-card hm-rev">
                <p className="hm-num">{n(i)}</p>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
                {t.href ? (
                  <Link className="pg-link" href={t.href}>{t.label} →</Link>
                ) : (
                  <Mail subject={t.subject} label={t.label} />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {CONTACT_EMAIL || whatsApp || call ? (
        <section className="hm-band hm-dark" aria-labelledby="reach">
          <div className="hm-wrap">
            <Eyebrow>Talk to a person</Eyebrow>
            <h2 id="reach" className="lp-display hm-h2">Reach us.</h2>
            <div className="hm-grid hm-grid-3">
              {CONTACT_EMAIL ? (
                <div className="hm-card hm-card-dark hm-rev">
                  <p className="hm-num">Email</p>
                  <p>
                    Write to us any time at <strong>{CONTACT_EMAIL}</strong>
                  </p>
                  <a className="pg-link" href={`mailto:${CONTACT_EMAIL}`}>
                    Open your email app →
                  </a>
                </div>
              ) : null}
              {whatsApp && CONTACT_WHATSAPP ? (
                <div className="hm-card hm-card-dark hm-rev">
                  <p className="hm-num">WhatsApp</p>
                  <p>
                    Message us on <strong>{displayPhone(CONTACT_WHATSAPP)}</strong>
                  </p>
                  <a className="pg-link" href={whatsApp} target="_blank" rel="noopener noreferrer">
                    Chat on WhatsApp →
                  </a>
                </div>
              ) : null}
              {call && CONTACT_PHONE ? (
                <div className="hm-card hm-card-dark hm-rev">
                  <p className="hm-num">Phone</p>
                  <p>
                    Call us on <strong>{displayPhone(CONTACT_PHONE)}</strong>, {REPLY_PROMISE.callHours}
                  </p>
                  <a className="pg-link" href={call}>
                    Call now →
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="hm-band" aria-labelledby="more">
        <div className="hm-wrap">
          <Eyebrow>Before you write</Eyebrow>
          <h2 id="more" className="lp-display hm-h2">You may already have the answer.</h2>
          <p className="hm-section-lede">
            Many questions are answered on our <Link href="/#faq">home page FAQ</Link>. For how we handle your data, see our{" "}
            <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.
          </p>
        </div>
      </section>

      <ClosingCta />
    </div>
  );
}

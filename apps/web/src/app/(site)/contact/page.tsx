import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/site/doc";
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
    <a className="ds-card-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}>
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

export default function ContactPage() {
  const whatsApp = whatsAppHref(CONTACT_WHATSAPP);
  const call = telHref(CONTACT_PHONE);
  return (
    <>
      <PageHead
        crumb="Contact Us"
        title="Contact us"
        sub="We're here to help. Choose the topic that fits best and a member of our team will get back to you."
      />
      <div className="ds-wrap">
        <section className="ds-section" aria-labelledby="topics">
          <h2 id="topics" className="sr-only">How can we help?</h2>
          <div className="ds-grid ds-grid-3">
            {TOPICS.map((t) => (
              <div key={t.title} className="ds-card">
                <h3>{t.title}</h3>
                <p>{t.body}</p>
                {t.href ? (
                  <Link className="ds-card-link" href={t.href}>{t.label} →</Link>
                ) : (
                  <Mail subject={t.subject} label={t.label} />
                )}
              </div>
            ))}
          </div>
        </section>

        {CONTACT_EMAIL || whatsApp || call ? (
          <section className="ds-section" aria-labelledby="reach">
            <h2 id="reach">Reach us</h2>
            <div className="ds-grid ds-grid-3">
              {CONTACT_EMAIL ? (
                <div className="ds-card">
                  <h3>Email</h3>
                  <p>
                    Write to us any time at <strong>{CONTACT_EMAIL}</strong>
                  </p>
                  <a className="ds-card-link" href={`mailto:${CONTACT_EMAIL}`}>
                    Open your email app →
                  </a>
                </div>
              ) : null}
              {whatsApp && CONTACT_WHATSAPP ? (
                <div className="ds-card">
                  <h3>WhatsApp</h3>
                  <p>
                    Message us on <strong>{displayPhone(CONTACT_WHATSAPP)}</strong>
                  </p>
                  <a className="ds-card-link" href={whatsApp} target="_blank" rel="noopener noreferrer">
                    Chat on WhatsApp →
                  </a>
                </div>
              ) : null}
              {call && CONTACT_PHONE ? (
                <div className="ds-card">
                  <h3>Phone</h3>
                  <p>
                    Call us on <strong>{displayPhone(CONTACT_PHONE)}</strong>, {REPLY_PROMISE.callHours}
                  </p>
                  <a className="ds-card-link" href={call}>
                    Call now →
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="ds-section" aria-labelledby="more">
          <h2 id="more">Before you write</h2>
          <p>
            Many questions are answered on our <Link href="/#faq" style={{ color: "var(--red-deep)" }}>home page FAQ</Link>. For how we handle
            your data, see our <Link href="/privacy" style={{ color: "var(--red-deep)" }}>Privacy Policy</Link> and{" "}
            <Link href="/terms" style={{ color: "var(--red-deep)" }}>Terms of Service</Link>.
          </p>
        </section>
      </div>
    </>
  );
}

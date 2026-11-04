import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, PageHead } from "@/components/site/doc";

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

const TOPICS = [
  {
    title: "Sales and pilots",
    body: "Want to try Alarsio on your sites? Tell us how many sites and workers you manage, and we'll help you get started.",
    subject: "Pilot enquiry",
    label: "Talk to us"
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
                <Mail subject={t.subject} label={t.label} />
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section" aria-labelledby="email">
          <h2 id="email">Email</h2>
          {CONTACT_EMAIL ? (
            <p>
              Write to us any time at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--red-deep)", fontWeight: 600 }}>{CONTACT_EMAIL}</a>.
            </p>
          ) : (
            <p>Our support email will be listed here shortly.</p>
          )}
        </section>

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

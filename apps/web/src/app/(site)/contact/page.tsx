import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Alarsio for questions, a pilot, or support.",
  alternates: { canonical: "/contact" }
};

// Set NEXT_PUBLIC_CONTACT_EMAIL in the deploy settings. No address is hard-coded here.
const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function ContactPage() {
  return (
    <article className="lp-doc">
      <p className="lp-mono lp-muted">Contact</p>
      <h1 className="lp-display lp-doc-title">Talk to us</h1>
      <p className="lp-doc-lead">
        Questions about Alarsio, starting a pilot on your sites, or help with your account: write to us and a person
        will reply.
      </p>

      <h2>Email</h2>
      {email ? (
        <p><a href={`mailto:${email}`}>{email}</a></p>
      ) : (
        <p>Our contact email is being set up. Please check back shortly.</p>
      )}

      <h2>Already have an account?</h2>
      <p>
        Include the email you signed up with and your company name, so we can find your account. Never send your
        password. We will never ask for it.
      </p>

      <h2>Data requests</h2>
      <p>
        To access, correct or delete personal data, email us from the address on your account. See the{" "}
        <Link href="/privacy">Privacy Policy</Link> for details.
      </p>

      <div className="lp-doc-actions">
        <Link href="/sign-up" className="lp-btn lp-btn-ink lp-mono">Get started</Link>
        <Link href="/about" className="lp-btn lp-btn-line lp-mono">About Alarsio</Link>
      </div>
    </article>
  );
}

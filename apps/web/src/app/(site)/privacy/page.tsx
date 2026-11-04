import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data Alarsio collects, why, who can see it, and your choices.",
  alternates: { canonical: "/privacy" }
};

const UPDATED = "4 November 2026";

export default function PrivacyPage() {
  return (
    <article className="lp-doc">
      <p className="lp-mono lp-muted">Last updated {UPDATED}</p>
      <h1 className="lp-display lp-doc-title">Privacy Policy</h1>
      <p className="lp-doc-note">
        <strong>Draft for review.</strong> This text describes how the product works but has not been reviewed by a
        lawyer. Have it checked against India&apos;s Digital Personal Data Protection Act, 2023 before relying on it.
      </p>

      <h2>Who we are</h2>
      <p>
        Alarsio provides software for contractors to keep site records. In this policy, &quot;the company&quot; is the
        contractor that creates an account and &quot;we&quot; is Alarsio. For the records a company keeps about its
        workers, the company decides what is collected and why; we store and process it on the company&apos;s behalf.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email address and sign-in details of the people who use Alarsio.</li>
        <li><strong>Company records:</strong> sites, workers, attendance, daily reports, materials, wage periods and corrections.</li>
        <li><strong>Photos and notes</strong> that users attach to reports. Photos are re-encoded on upload, which removes embedded camera metadata.</li>
        <li><strong>Technical data:</strong> basic logs needed to run and secure the service.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide the service: record attendance, reports and materials, and calculate wages.</li>
        <li>To sign you in, send verification and invitation emails, and keep accounts secure.</li>
        <li>To fix problems and keep the service reliable.</li>
      </ul>
      <p>We do not sell personal data and we do not use it for advertising.</p>

      <h2>Who can see it</h2>
      <p>
        Inside a company, what a person can see depends on their role (for example owner, manager, supervisor or
        accountant). Records of one company are separated from every other company&apos;s by database access rules.
      </p>

      <h2>Service providers</h2>
      <p>
        We use hosting, database, authentication, file storage and email providers to run Alarsio. They process data
        only to provide those services to us.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Company records are kept while the account is active. When a company asks us to delete its account, we delete
        its records, except where the law requires us to keep something.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>The company owner can download all of the company&apos;s data as CSV files at any time.</li>
        <li>You can ask to access, correct or delete personal data we hold about you. Workers should first ask their employer, who controls their records.</li>
        <li>You can stop using Alarsio at any time.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections and access is limited by role. No system is perfectly secure, and we
        will tell affected companies if a breach affects their data.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We will update the date above when this policy changes. Questions or requests: see our{" "}
        <Link href="/contact">Contact page</Link>.
      </p>
    </article>
  );
}

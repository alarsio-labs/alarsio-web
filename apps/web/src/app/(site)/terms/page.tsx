import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Alarsio.",
  alternates: { canonical: "/terms" }
};

const UPDATED = "4 November 2026";

export default function TermsPage() {
  return (
    <article className="lp-doc">
      <p className="lp-mono lp-muted">Last updated {UPDATED}</p>
      <h1 className="lp-display lp-doc-title">Terms of Service</h1>
      <p className="lp-doc-note">
        <strong>Draft for review.</strong> This is a plain-language starting point, not legal advice. Have a lawyer
        review it, and add your company&apos;s legal name, governing law and jurisdiction, before launch.
      </p>

      <h2>Using Alarsio</h2>
      <p>
        By creating an account or using Alarsio you agree to these terms. If you use it for a company, you confirm you
        are allowed to accept them for that company.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate information and keep your sign-in details private.</li>
        <li>You are responsible for what happens under your account, and for the people you invite.</li>
        <li>Tell us promptly if you think your account has been used without your permission.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        The company owns the records it enters. You give us permission to store and process them to provide the
        service. You are responsible for having the right to record information about your workers, and for telling
        them what you record. See the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not break the law or use Alarsio to record false information.</li>
        <li>Do not try to access another company&apos;s data or disrupt the service.</li>
        <li>Do not copy, resell or reverse engineer the service except as the law allows.</li>
      </ul>

      <h2>Wages and records</h2>
      <p>
        Alarsio calculates wages from the attendance and rates that your company enters and approves. You are
        responsible for checking the figures before paying anyone. Alarsio is a record-keeping tool; it does not make
        payments and is not payroll, tax or legal advice.
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep Alarsio available and your data safe, but we cannot promise it will always be uninterrupted or
        error free. The Android app is designed to keep working offline and to sync when a connection returns.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop at any time and download your data first. We may suspend an account that breaks these terms or
        puts the service or other users at risk.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, Alarsio is provided &quot;as is&quot; and we are not liable for indirect or
        consequential loss. Nothing here limits liability that cannot be limited by law.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the date above when we do. Continued use means you accept the
        update. Questions: see our <Link href="/contact">Contact page</Link>.
      </p>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalDoc, type DocSection } from "@/components/site/doc";
import { PageHero } from "@/components/site/page-hero";
import { LEGAL } from "@/lib/site/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Alarsio, the site records app for construction contractors.",
  alternates: { canonical: "/terms" }
};

// Not yet reviewed by a lawyer: have it checked before relying on it.
// Entity, address and courts' city come from lib/site/legal.ts.
const UPDATED = "6 November 2026";

const sections: DocSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of these terms",
    body: (
      <>
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of the Alarsio website, web app and Android app
          (the &quot;Service&quot;). By creating an account or using the Service, you agree to these Terms and to our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          If you accept these Terms on behalf of a business (the &quot;Customer&quot;), you confirm that you have the
          authority to bind that business. In that case &quot;you&quot; means the Customer.
        </p>
      </>
    )
  },
  {
    id: "service",
    title: "The Service",
    body: (
      <p>
        Alarsio helps construction businesses record attendance, daily reports and materials on site, including without
        an internet connection, and calculate wages from approved attendance. We may improve, change or add features
        over time. If we remove a feature you rely on, we will try to give you reasonable notice.
      </p>
    )
  },
  {
    id: "accounts",
    title: "Accounts and security",
    body: (
      <ul>
        <li>You must provide accurate information and keep it up to date.</li>
        <li>You are responsible for keeping sign-in details confidential and for all activity under your account.</li>
        <li>The account owner decides who is invited and which role each person has, and is responsible for their use of the Service.</li>
        <li>Tell us promptly at <ContactLink /> if you suspect unauthorised use of your account.</li>
      </ul>
    )
  },
  {
    id: "data",
    title: "Your data",
    body: (
      <>
        <p>
          You own the records you enter into the Service (&quot;Customer Data&quot;). You grant us a limited right to host,
          process and display Customer Data only to provide and support the Service. You can export your Customer Data
          as CSV files at any time.
        </p>
        <p>
          You are responsible for having a lawful basis to record information about your workers and team, and for
          informing them about it, as required by applicable law.
        </p>
      </>
    )
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use the Service for any unlawful purpose or to record information you know to be false;</li>
          <li>attempt to access another Customer&apos;s data, or any part of the Service you are not authorised to use;</li>
          <li>interfere with, overload or disrupt the Service or its security;</li>
          <li>copy, resell, or reverse engineer the Service, except where the law allows it.</li>
        </ul>
      </>
    )
  },
  {
    id: "wages",
    title: "Wages, records and your responsibilities",
    body: (
      <p>
        Wage figures in Alarsio are calculated from the attendance, rates and corrections your team enters and approves.
        You are responsible for reviewing them before making any payment. Alarsio does not make payments and does not
        provide payroll, tax, labour-law or legal advice.
      </p>
    )
  },
  {
    id: "fees",
    title: "Fees",
    body: (
      <p>
        Any fees for the Service, and how they are billed, will be agreed with you in writing before they apply. We will
        not charge you for anything you have not agreed to.
      </p>
    )
  },
  {
    id: "ip",
    title: "Intellectual property",
    body: (
      <p>
        The Service, including its software, design and content (other than Customer Data), belongs to Alarsio and is
        protected by law. These Terms give you a right to use the Service; they do not transfer any ownership to you.
        If you send us feedback, we may use it without any obligation to you.
      </p>
    )
  },
  {
    id: "availability",
    title: "Availability",
    body: (
      <p>
        We work to keep the Service available and your data safe, but we do not guarantee that it will be uninterrupted
        or error-free. The Android app is designed to keep working offline and to sync when a connection returns.
        Planned maintenance will be scheduled to limit disruption where possible.
      </p>
    )
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <p>
        You may stop using the Service at any time. Please export your data before you close your account. We may
        suspend or close an account that breaches these Terms or puts the Service or other users at risk; where
        reasonable, we will notify you first and give you a chance to export your data.
      </p>
    )
  },
  {
    id: "liability",
    title: "Disclaimers and limitation of liability",
    body: (
      <p>
        To the extent permitted by law, the Service is provided &quot;as is&quot;, and Alarsio is not liable for any
        indirect, incidental, special or consequential loss, or for loss of profits, revenue or data. Nothing in these
        Terms limits any liability that cannot be limited under applicable law.
      </p>
    )
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of India. Any dispute is subject to the courts at {LEGAL.courtsCity}. We
        encourage you to contact us first so we can try to resolve any dispute informally.
      </p>
    )
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms from time to time. We will change the &quot;Last updated&quot; date above and, for
        significant changes, notify account owners in advance. Continuing to use the Service after a change takes
        effect means you accept the updated Terms.
      </p>
    )
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <p>
        These Terms are offered by {LEGAL.entity}, at {LEGAL.address}. Questions about these Terms? Write to us at{" "}
        <ContactLink />.
      </p>
    )
  }
];

export default function TermsPage() {
  // In the About look (docs/DESIGN.md 2b-i): the hero, then the contents list beside a reading column.
  return (
    <div className="hm">
      <PageHero crumb="Terms of Service" eyebrow="Legal" title="Terms of Service" lede="Please read these Terms carefully. They set out your rights and responsibilities when you use Alarsio." meta={`Last updated: ${UPDATED}`} />
      <section className="hm-band hm-paper" aria-label="Terms of Service">
        <div className="hm-wrap">
          <LegalDoc sections={sections} />
        </div>
      </section>
    </div>
  );
}

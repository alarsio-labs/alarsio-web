import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalDoc, type DocSection } from "@/components/site/doc";
import { PageHero } from "@/components/site/page-hero";
import { GRIEVANCE_TIME, LEGAL } from "@/lib/site/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Alarsio collects, uses, shares and protects personal data, and the rights you have over it.",
  alternates: { canonical: "/privacy" }
};

// Not yet reviewed by a lawyer: have it checked against the DPDP Act, 2023 before relying on it.
// Entity, address and Grievance Officer come from lib/site/legal.ts.
const UPDATED = "8 November 2026";

const sections: DocSection[] = [
  {
    id: "scope",
    title: "Scope of this policy",
    body: (
      <>
        <p>
          This policy explains how Alarsio (&quot;Alarsio&quot;, &quot;we&quot;, &quot;us&quot;) handles personal data when you visit
          our website, use the Alarsio web app or the Alarsio Android app (together, the &quot;Service&quot;).
        </p>
        <p>
          Alarsio is used by construction businesses (&quot;Customers&quot;) to keep records about their sites and the
          people who work on them. For those records, the Customer decides what is collected and why, and we process
          the data on the Customer&apos;s behalf and on its instructions. If you are a worker whose details are kept in
          Alarsio by your employer, please contact your employer first about your data.
        </p>
      </>
    )
  },
  {
    id: "collect",
    title: "Information we collect",
    body: (
      <>
        <h3>Information you give us</h3>
        <ul>
          <li><strong>Account details:</strong> name, email address and password (stored only in hashed form) of each person who uses the Service.</li>
          <li><strong>Company details:</strong> company name, sites, team members and their roles.</li>
          <li><strong>Worker records:</strong> names, phone numbers, wage rates, attendance, and corrections entered by the Customer.</li>
          <li><strong>Site records:</strong> daily reports, notes, materials received and used, and photos attached to reports.</li>
          <li><strong>Messages</strong> you send us, for example a support request.</li>
          <li><strong>Demo enquiries:</strong> when you ask for a demo on our website, your name, mobile number, city and number of active sites, and, if you choose to give them, your company name and whether you prefer WhatsApp or a phone call. See <a href="#enquiries">Demo enquiries</a>.</li>
        </ul>
        <h3>Information collected when you use the Service</h3>
        <ul>
          <li><strong>Location at check-in:</strong> the Android app reads the phone&apos;s location once, when a supervisor taps to check in, to confirm they are at the site. It does not track location in the background.</li>
          <li><strong>Photos:</strong> photos are re-encoded when uploaded, which removes embedded camera metadata.</li>
          <li><strong>Crash and error reports</strong> from the Android app, so we can find and fix faults.</li>
          <li><strong>Technical logs</strong> such as IP address, browser or device type and request times, kept to operate and secure the Service.</li>
        </ul>
      </>
    )
  },
  {
    id: "enquiries",
    title: "Demo enquiries",
    body: (
      <>
        <p>
          The &quot;Book a demo&quot; form asks for your name, mobile number, city and how many active sites you run.
          Your company name and how you prefer to be contacted are optional. We do not ask for your email.
        </p>
        <p>
          <strong>Why we use it.</strong> Only to contact you about your enquiry, by WhatsApp or phone, and to show
          you Alarsio. We do not add you to a marketing list, and we never sell or share your enquiry for anyone
          else&apos;s marketing.
        </p>
        <p>
          <strong>Where it goes.</strong> Your enquiry is sent as an email to the Alarsio team through our email
          provider (Resend). It is not saved in the Alarsio app or its database, and it does not create an account.
        </p>
        <p>
          <strong>How long we keep it.</strong> In the team inbox and our WhatsApp or call history until the
          conversation ends, and no longer than 12 months after your last message to us. If you become a Customer,
          your account details are then covered by the rest of this policy.
        </p>
        <p>
          <strong>Your choice.</strong> You can ask us at any time to stop contacting you or to delete your enquiry.
          Use the details in <a href="#contact">Contact and grievances</a>, or reply &quot;stop&quot; on WhatsApp.
        </p>
      </>
    )
  },
  {
    id: "use",
    title: "How we use information",
    body: (
      <>
        <p>We use personal data only to:</p>
        <ul>
          <li>provide the Service: record attendance, reports and materials, and calculate wages from approved attendance;</li>
          <li>create and secure accounts, sign users in, and send verification and invitation emails;</li>
          <li>respond to support requests and demo enquiries, and tell you about changes to the Service;</li>
          <li>detect, investigate and prevent errors, misuse and security incidents;</li>
          <li>comply with legal obligations.</li>
        </ul>
        <p>We do not sell personal data, and we do not use it for advertising or to build marketing profiles.</p>
      </>
    )
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <>
        <p>
          <strong>Always on.</strong> Cookies that keep you signed in and keep your session secure, and{" "}
          <code>alarsio_consent</code>, which remembers your cookie choice for six months. The Service cannot work
          without them, so they do not need your consent.
        </p>
        <p>
          <strong>Analytics, only if you accept.</strong> On our public pages (not inside the app) we use Google
          Analytics to count visits and see which pages are useful. Its cookies, <code>_ga</code> and{" "}
          <code>_ga_*</code>, are set only after you click Accept on the cookie banner, and last up to two years. We
          turn off Google signals and advertising features, so this data is not used for ads.
        </p>
        <p>
          You can change your choice at any time with &quot;Cookie settings&quot; at the bottom of any public page. If
          you reject, we stop Google Analytics and delete its cookies. We do not use advertising cookies.
        </p>
      </>
    )
  },
  {
    id: "sharing",
    title: "How information is shared",
    body: (
      <>
        <p>
          <strong>Within a Customer&apos;s account.</strong> What a person can see depends on their role (owner, project
          manager, supervisor or accountant). A supervisor sees only the sites assigned to them. Each Customer&apos;s
          records are kept separate from every other Customer&apos;s by access rules enforced in the database.
        </p>
        <p>
          <strong>Service providers.</strong> We use trusted providers to host the Service and to store data (Vercel and
          Supabase), to send emails (including demo enquiries, through Resend), to receive app crash reports, and, if you accept analytics cookies, to measure visits to our
          public pages (Google Analytics). They process data only on our instructions and
          only to provide their service to us.
        </p>
        <p>
          <strong>Legal reasons.</strong> We may disclose information if required by law, or to protect the rights,
          property or safety of Alarsio, our Customers or others.
        </p>
      </>
    )
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <p>
        We keep Customer records for as long as the Customer&apos;s account is active. When a Customer closes its
        account, we delete its records within a reasonable period, except where we must keep information to meet a
        legal obligation or resolve a dispute. Demo enquiries are kept for no longer than 12 months after your last
        message to us. Technical logs are kept for a limited time.
      </p>
    )
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Data is encrypted in transit, access is restricted by role, and passwords are stored only in hashed form. No
        system is completely secure, but if a breach affects your personal data we will notify the affected Customers
        and the authorities as the law requires.
      </p>
    )
  },
  {
    id: "rights",
    title: "Your rights and choices",
    body: (
      <>
        <p>Subject to applicable law, including India&apos;s Digital Personal Data Protection Act, 2023, you may:</p>
        <ul>
          <li>ask for a summary of the personal data we process about you;</li>
          <li>ask us to correct, complete or update it;</li>
          <li>ask us to erase it, where we no longer need it or you withdraw consent;</li>
          <li>withdraw consent you have given, without affecting processing already done;</li>
          <li>nominate another person to exercise your rights in case of death or incapacity;</li>
          <li>raise a grievance with us, and then with the Data Protection Board of India.</li>
        </ul>
        <p>
          A Customer&apos;s owner can also download all of the Customer&apos;s data as CSV files at any time. Where we
          hold data on behalf of a Customer, we will pass your request to that Customer.
        </p>
      </>
    )
  },
  {
    id: "children",
    title: "Children",
    body: <p>The Service is meant for businesses and is not directed at children. We do not knowingly collect personal data from children.</p>
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the Service changes. We will change the &quot;Last updated&quot; date above and,
        for significant changes, notify account owners by email or in the app.
      </p>
    )
  },
  {
    id: "contact",
    title: "Contact and grievances",
    body: (
      <>
        <p>
          The service is provided by {LEGAL.entity}, at {LEGAL.address}.
        </p>
        <p>
          For questions, requests or complaints about your personal data, write to us at <ContactLink />, or to our
          Grievance Officer, {LEGAL.officerName}, at <a href={`mailto:${LEGAL.officerEmail}`}>{LEGAL.officerEmail}</a>.{" "}
          {GRIEVANCE_TIME} See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </>
    )
  }
];

export default function PrivacyPage() {
  // In the About look (docs/DESIGN.md 2b-i): the hero, then the contents list beside a reading column.
  return (
    <div className="hm">
      <PageHero crumb="Privacy Policy" eyebrow="Legal" title="Privacy Policy" lede="Your records belong to you. This policy explains, in plain language, what we collect, why, and the control you have over it." meta={`Last updated: ${UPDATED}`} />
      <section className="hm-band hm-paper" aria-label="Privacy Policy">
        <div className="hm-wrap">
          <LegalDoc sections={sections} />
        </div>
      </section>
    </div>
  );
}

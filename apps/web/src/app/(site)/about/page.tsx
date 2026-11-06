import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/site/doc";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Alarsio is an offline-first site records app for construction contractors in India: attendance, daily reports, materials and wages.",
  alternates: { canonical: "/about" }
};

const FEATURES = [
  { title: "Attendance", body: "Supervisors mark attendance on site, even with no signal. Managers approve it before it counts." },
  { title: "Daily reports", body: "Work done, photos and notes for every site, every day, in one place." },
  { title: "Materials", body: "Track what arrives on site and what is used, so stock stays in step." },
  { title: "Wages", body: "Wage periods built from approved attendance, with every correction recorded and exportable." }
];

const PRINCIPLES = [
  { title: "Works where the work is", body: "Everything is saved on the phone first and synced when a connection returns. A weak tower never costs you a day's record." },
  { title: "Your data stays yours", body: "Each company's records are kept separate, and the owner can export everything as CSV at any time." },
  { title: "Right access for each role", body: "Owners, project managers, supervisors and accountants each see what their job needs, enforced in the database." }
];

export default function AboutPage() {
  return (
    <>
      <PageHead
        crumb="About Us"
        title="About Alarsio"
        sub="We build simple, reliable record-keeping for construction contractors in India, so the day on site turns into accurate attendance and fair, on-time wages."
      />
      <div className="ds-wrap">
        <section className="ds-section" aria-labelledby="mission">
          <span className="ds-kicker">Our mission</span>
          <h2 id="mission">Replace notebooks and WhatsApp with one trusted record</h2>
          <p>
            On most sites, the day lives in notebooks, photos and chat messages. At month end someone rebuilds
            attendance and materials from memory, and wage disputes follow. Alarsio gives supervisors a fast way to
            capture the day on site, even without internet, and gives the office one record it can trust.
          </p>
        </section>

        <section className="ds-section" aria-labelledby="what">
          <span className="ds-kicker">What we do</span>
          <h2 id="what">Everything a site needs, in one app</h2>
          <p>Built for contractors running 2 to 20 sites, on Android phones and in any modern web browser.</p>
          <div className="ds-grid ds-grid-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="ds-card">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section" aria-labelledby="principles">
          <span className="ds-kicker">What we stand for</span>
          <h2 id="principles">Our principles</h2>
          <div className="ds-grid ds-grid-3">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="ds-card">
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-cta" aria-labelledby="cta">
          <div>
            <h2 id="cta">Run 2 to 20 sites? Join the pilot.</h2>
            <p>Create your company account and start with one site this week.</p>
          </div>
          <div className="ds-cta-actions">
            <Link href="/sign-up" className="lp-pill lp-pill-red">Start free pilot</Link>
            <Link href="/contact" className="lp-pill lp-pill-ghost">Contact us</Link>
          </div>
        </section>
      </div>
    </>
  );
}

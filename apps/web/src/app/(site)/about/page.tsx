import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/site/eyebrow";
import { CTA, MARQUEE } from "@/lib/landing/content";
import "@/app/home.css";
import "./about.css";

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

const n = (i: number) => String(i + 1).padStart(2, "0");

// About, in the home page's look (docs/DESIGN.md section 2): the same bands, headlines, cards and
// closing call to action, with the copy this page always had. Static; no script of its own.
export default function AboutPage() {
  return (
    <div className="hm">
      <section className="hm-band ab-hero" aria-labelledby="about-title">
        <div className="hm-wrap">
          <Eyebrow>About Alarsio</Eyebrow>
          <h1 id="about-title" className="lp-display hm-h1">Replace notebooks and WhatsApp with one trusted record.</h1>
          <p className="hm-lede">
            We build simple, reliable record-keeping for construction contractors in India, so the day on site
            turns into accurate attendance and fair, on-time wages.
          </p>
          <ul className="ab-facts" aria-label="At a glance">
            {MARQUEE.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      </section>

      <section className="hm-band hm-dark" aria-labelledby="mission-title">
        <div className="hm-wrap ab-split">
          <div>
            <Eyebrow>Our mission</Eyebrow>
            <h2 id="mission-title" className="lp-display hm-h2">One record the whole company can trust.</h2>
          </div>
          <p className="ab-body">
            On most sites, the day lives in notebooks, photos and chat messages. At month end someone rebuilds
            attendance and materials from memory, and wage disputes follow. Alarsio gives supervisors a fast way to
            capture the day on site, even without internet, and gives the office one record it can trust.
          </p>
        </div>
      </section>

      <section className="hm-band" aria-labelledby="what-title">
        <div className="hm-wrap">
          <Eyebrow>What we do</Eyebrow>
          <h2 id="what-title" className="lp-display hm-h2">Everything a site needs, in one app.</h2>
          <p className="hm-section-lede">Built for contractors running 2 to 20 sites, on Android phones and in any modern web browser.</p>
          <ol className="hm-grid hm-grid-4">
            {FEATURES.map((f, i) => (
              <li key={f.title} className="hm-card hm-rev">
                <p className="hm-num">{n(i)}</p>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hm-band hm-dark" aria-labelledby="principles-title">
        <div className="hm-wrap">
          <Eyebrow>What we stand for</Eyebrow>
          <h2 id="principles-title" className="lp-display hm-h2">Our principles.</h2>
          <ol className="hm-grid hm-grid-3">
            {PRINCIPLES.map((p, i) => (
              <li key={p.title} className="hm-card hm-card-dark hm-rev">
                <p className="hm-num">{n(i)}</p>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hm-cta" aria-labelledby="about-cta-title">
        <div className="hm-wrap">
          <h2 id="about-cta-title" className="lp-display hm-cta-title">{CTA.title}</h2>
          <p className="hm-cta-body">{CTA.body}</p>
          <div className="hm-actions">
            <Link href={CTA.primary.href} className="lp-pill lp-pill-ink">{CTA.primary.label} →</Link>
            <Link href={CTA.pilot.href} className="lp-pill lp-pill-line">{CTA.pilot.label}</Link>
          </div>
          <p className="hm-note">{CTA.note}</p>
        </div>
      </section>
    </div>
  );
}

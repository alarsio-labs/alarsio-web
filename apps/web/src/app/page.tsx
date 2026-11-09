import type { Metadata } from "next";
import Link from "next/link";
import { CTA, DAY_RECORD, FAQ, FEATURES, HEATMAP, HERO, MARQUEE, PROBLEMS, ROLES, STEPS, TRUST, VIDEO, roleId } from "@/lib/landing/content";
import { AdVideo } from "@/components/landing/ad-video";
import { SeasonHeatmap } from "@/components/landing/season-heatmap";
import { DashboardMock, PhoneMock } from "@/components/landing/screen-mocks";
import { StructuredData } from "@/components/landing/structured-data";
import { Eyebrow } from "@/components/site/eyebrow";
import { PublicHeader, SiteFooter } from "@/components/site/public-frame";
import { anton, mono } from "./fonts";
import "./landing.css";
import "./home.css";

export const metadata: Metadata = {
  // The words contractors search for come first; the brand line stays in the hero.
  title: { absolute: "Alarsio · Construction site attendance, reports & wages app" },
  description:
    "Attendance, daily reports and materials captured offline on site, and wages built from approved attendance. For contractors in India running 2 to 20 sites."
};

const n = (i: number) => String(i + 1).padStart(2, "0");
const LAST = DAY_RECORD.status.length - 1;

// The public home page (docs/DESIGN.md v2.1, section 2). Static and server-rendered: proxy.ts
// sends a signed-in visitor to their dashboard first. Light and dark bands alternate; the only
// script is the heatmap's. Reveal motion is CSS only and off under reduced motion.
export default function Home() {
  return (
    <div className={`lp hm ${anton.variable} ${mono.variable}`}>
      <PublicHeader />

      <main id="main" tabIndex={-1}>
        {/* 1 · Hero */}
        <section className="hm-hero" aria-labelledby="hero-title">
          <div className="hm-wrap hm-hero-grid">
            <div className="hm-hero-copy">
              <Eyebrow>{HERO.eyebrow}</Eyebrow>
              <h1 id="hero-title" className="lp-display hm-h1">{HERO.title}</h1>
              <p className="hm-lede">{HERO.lede}</p>
              <div className="hm-actions">
                <Link href={CTA.primary.href} className="lp-pill lp-pill-red">{CTA.primary.label} →</Link>
                <Link href={CTA.pilot.href} className="lp-pill lp-pill-line">{CTA.pilot.label}</Link>
              </div>
              <p className="hm-note">{HERO.note}</p>
            </div>
            <div className="hm-hero-visual">
              <DashboardMock />
              <PhoneMock />
              <p className="hm-caption">Sample sites and figures</p>
            </div>
          </div>
        </section>

        {/* 2 · Marquee */}
        <div className="hm-marquee" aria-label="At a glance">
          <ul className="hm-marquee-track">
            {MARQUEE.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <ul className="hm-marquee-track" aria-hidden="true">
            {MARQUEE.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>

        {/* 2b · Product video */}
        <section className="hm-band hm-video-band" aria-labelledby="video-title">
          <div className="hm-wrap">
            <Eyebrow>{VIDEO.eyebrow}</Eyebrow>
            <h2 id="video-title" className="lp-display hm-h2">{VIDEO.title}</h2>
            <div className="hm-video-frame">
              <AdVideo src={VIDEO.src} poster={VIDEO.poster} label={VIDEO.label} />
            </div>
            <p className="hm-caption">{VIDEO.caption}</p>
          </div>
        </section>

        {/* 3 · Problem */}
        <section className="hm-band hm-dark" aria-labelledby="problem-title">
          <div className="hm-wrap">
            <Eyebrow>{PROBLEMS.eyebrow}</Eyebrow>
            <h2 id="problem-title" className="lp-display hm-h2">{PROBLEMS.title}</h2>
            <ol className="hm-grid hm-grid-3">
              {PROBLEMS.items.map((p, i) => (
                <li key={p.title} className="hm-card hm-card-dark hm-rev">
                  <p className="hm-num">Problem {n(i)} ·</p>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 4 · Features */}
        <section id="features" className="hm-band" aria-labelledby="features-title">
          <div className="hm-wrap">
            <Eyebrow>{FEATURES.eyebrow}</Eyebrow>
            <h2 id="features-title" className="lp-display hm-h2">{FEATURES.title}</h2>
            <ol className="hm-grid hm-grid-3">
              {FEATURES.items.map((f, i) => (
                <li key={f.title} className="hm-card hm-rev">
                  <p className="hm-num">{n(i)}</p>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                  <p className="hm-tag">{f.role}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 5 · Roles */}
        <section id="roles" className="hm-band hm-dark" aria-labelledby="roles-title">
          <div className="hm-wrap">
            <Eyebrow>{ROLES.eyebrow}</Eyebrow>
            <h2 id="roles-title" className="lp-display hm-h2">{ROLES.title}</h2>
            <ol className="hm-grid hm-grid-4">
              {ROLES.cards.map((r, i) => (
                <li key={r.role} id={roleId(r.role)} className="hm-card hm-card-dark hm-role hm-rev">
                  <p className="hm-num">{n(i)} · {r.where}</p>
                  <h3>{r.role}</h3>
                  <dl>
                    <dt>Does</dt>
                    <dd>{r.does}</dd>
                    <dt>Sees</dt>
                    <dd>{r.sees}</dd>
                  </dl>
                  <Link href={r.cta.href} className="lp-pill lp-pill-cream">{r.cta.label}</Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 6 · How it works, with the day record slip */}
        <section id="how" className="hm-band" aria-labelledby="how-title">
          <div className="hm-wrap hm-how">
            <div>
              <Eyebrow>{STEPS.eyebrow}</Eyebrow>
              <h2 id="how-title" className="lp-display hm-h2">{STEPS.title}</h2>
              <ol className="hm-steps">
                {STEPS.items.map((s, i) => (
                  <li key={s.title} className="hm-rev">
                    <span className="hm-step-n" aria-hidden="true">{n(i)}</span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <aside className="hm-sync" aria-labelledby="sync-title">
              <Eyebrow>{DAY_RECORD.eyebrow}</Eyebrow>
              <h3 id="sync-title" className="lp-display hm-h3">{DAY_RECORD.title}</h3>
              <p className="hm-sync-body">{DAY_RECORD.body}</p>
              <ol className="hm-sync-states" aria-label="What the phone says, in order">
                {DAY_RECORD.status.map((s, i) => (
                  <li key={s} data-final={i === LAST ? "" : undefined}>{s}</li>
                ))}
              </ol>
              <div className="hm-slip" role="img" aria-label="A day record slip for Baner Residency, Tower A, approved and ready for wages">
                <div aria-hidden="true">
                  <p className="hm-slip-head">{DAY_RECORD.header}</p>
                  <p className="lp-display hm-slip-name">{DAY_RECORD.name}</p>
                  <ul className="hm-slip-cues">
                    {DAY_RECORD.cues.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                  <div className="hm-slip-perf" />
                  {DAY_RECORD.rows.map((r) => (
                    <p key={r.label} className="hm-slip-row"><span>{r.label}</span><b>{r.values[LAST]}</b></p>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* 7 · Heatmap */}
        <section className="hm-band hm-paper" aria-labelledby="heat-title">
          <div className="hm-wrap">
            <Eyebrow>{HEATMAP.eyebrow}</Eyebrow>
            <h2 id="heat-title" className="lp-display hm-h2">{HEATMAP.title}</h2>
            <p className="hm-section-lede">{HEATMAP.body}</p>
            <SeasonHeatmap />
            <p className="hm-caption">{HEATMAP.caption}</p>
          </div>
        </section>

        {/* 8 · Trust */}
        <section className="hm-band hm-dark" aria-labelledby="trust-title">
          <div className="hm-wrap">
            <Eyebrow>{TRUST.eyebrow}</Eyebrow>
            <h2 id="trust-title" className="lp-display hm-h2">{TRUST.title}</h2>
            <ul className="hm-grid hm-grid-4">
              {TRUST.items.map((t, i) => (
                <li key={t.title} className="hm-card hm-card-dark hm-rev">
                  <p className="hm-num">{n(i)}</p>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 9 · FAQ */}
        <section id="faq" className="hm-band" aria-labelledby="faq-title">
          <div className="hm-wrap hm-faq-grid">
            <div>
              <Eyebrow>Questions</Eyebrow>
              <h2 id="faq-title" className="lp-display hm-h2">Asked by contractors.</h2>
              <p className="hm-section-lede">
                Something else? <Link href="/contact">Write to us</Link>.
              </p>
            </div>
            <div className="hm-faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 10 · Closing call to action */}
        <section className="hm-cta" aria-labelledby="cta-title">
          <div className="hm-wrap">
            <h2 id="cta-title" className="lp-display hm-cta-title">{CTA.title}</h2>
            <p className="hm-cta-body">{CTA.body}</p>
            <div className="hm-actions">
              <Link href={CTA.primary.href} className="lp-pill lp-pill-ink">{CTA.primary.label} →</Link>
              <Link href={CTA.pilot.href} className="lp-pill lp-pill-line">{CTA.pilot.label}</Link>
            </div>
            <p className="hm-note">{CTA.note}</p>
          </div>
        </section>
      </main>

      <SiteFooter />
      <StructuredData />
    </div>
  );
}

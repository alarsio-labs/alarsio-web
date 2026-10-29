import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Anton, Martian_Mono } from "next/font/google";
import { supabaseServer } from "@/lib/supabase/server";
import { CTA, DAY_RECORD, FAQ, HERO, MANIFESTO, RAIL, ROLES, WAGES } from "@/lib/landing/content";
import { LandingMotion } from "@/components/landing/landing-motion";
import { Words } from "@/components/landing/words";
import "./landing.css";

// Self-hosted at build time by next/font, like Inter in the layout.
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const mono = Martian_Mono({ weight: "400", subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Alarsio · Site records with no signal",
  description:
    "Attendance, daily reports and materials captured offline on site, and wages built from approved attendance. For contractors running 2 to 20 sites."
};

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const d = (i: number, step = 60): Vars => ({ "--d": `${i * step}ms` });
const LAST = DAY_RECORD.status.length - 1;

function Wordmark() {
  return (
    <Link href="/" className="lp-display lp-wordmark" aria-label="Alarsio, home">
      Alar<span>sio</span>
    </Link>
  );
}

// The public landing page (docs/DESIGN.md v2). A signed-in visitor goes straight to
// their dashboard, as / always did. The server renders the finished state; the
// motion script rewinds it to the start only when it runs.
export default async function Home() {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className={`lp ${anton.variable} ${mono.variable}`}>
      <header className="lp-head">
        <Wordmark />
        <nav aria-label="Main" className="lp-nav lp-mono">
          {[["#records", "Records"], ["#day-record", "Day record"], ["#wages", "Wages"], ["#faq", "FAQ"]].map(([href, label], i) => (
            <a key={href} href={href} data-rev="" style={d(i, 50)}>{label}</a>
          ))}
        </nav>
        <div className="lp-head-actions">
          <Link href={CTA.secondary.href} className="lp-btn lp-btn-line lp-mono">{CTA.secondary.label}</Link>
          <Link href={CTA.primary.href} className="lp-btn lp-btn-ink lp-mono">{CTA.primary.label}</Link>
        </div>
      </header>

      <main>
        {/* 1 · Poster hero */}
        <section className="lp-stage lp-hero on-loam" style={{ "--h": "280svh" } as Vars} data-stage="hero" aria-labelledby="hero-title">
          <div className="lp-pin">
            <canvas data-live="hero" aria-hidden="true" />
            <h1 id="hero-title" className="lp-lockup lp-display">
              <Words text={HERO.top} className="lp-poster lp-poster-top" style={{ "--chars": HERO.top.length } as Vars} />
              <span className="lp-poster lp-poster-brand" style={{ "--chars": HERO.brand.length } as Vars} data-rev="">
                {HERO.brand}
              </span>
            </h1>
            <ul className="lp-hero-meta lp-mono" aria-label="At a glance">
              {HERO.meta.map((m, i) => (
                <li key={m} data-rev="" style={d(i + 4, 90)}>{m}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* 2 · Clip-wipe manifesto */}
        <section className="lp-stage lp-man" style={{ "--h": "260svh" } as Vars} data-stage="manifesto" aria-label="What Alarsio is for">
          <div className="lp-pin">
            <div className="lp-man-box lp-display">
              <Words as="p" text={MANIFESTO} className="lp-man-base" />
              <div className="lp-man-fill" aria-hidden="true">
                <Words as="p" text={MANIFESTO} />
              </div>
            </div>
          </div>
        </section>

        {/* 3 · Horizontal rail */}
        <section id="records" className="lp-stage lp-rail" style={{ "--h": "340svh" } as Vars} data-stage="rail" aria-labelledby="rail-title">
          <div className="lp-pin">
            <div className="lp-rail-head">
              <Words as="h2" id="rail-title" text={RAIL.title} className="lp-display lp-rail-headline" />
              <p className="lp-mono lp-muted" data-rev="" style={d(2)}>{RAIL.hint}</p>
            </div>
            <ul className="lp-track" data-rail-track="">
              {RAIL.cards.map((c, i) => (
                <li key={c.title} className="lp-card" data-rev="" style={d(i, 80)}>
                  <canvas data-plate={c.plate} aria-hidden="true" />
                  <h3 className="lp-display" data-rev="" style={d(i, 80)}>{c.title}</h3>
                  <div className="lp-card-meta lp-mono">
                    <span className="lp-muted" data-rev="" style={d(i + 1, 80)}>{c.type}</span>
                    <span className="lp-role" data-rev="" style={d(i + 2, 80)}>{c.role}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="lp-meter" aria-hidden="true"><i /></div>
          </div>
        </section>

        {/* 4 · The day record */}
        <section id="day-record" className="lp-stage lp-rec on-loam" style={{ "--h": "420svh" } as Vars} data-stage="record" aria-labelledby="rec-title">
          <div className="lp-pin">
            <div className="lp-rec-copy">
              <p className="lp-mono" data-rev="" style={{ color: "var(--cream-muted)" }}>{DAY_RECORD.eyebrow}</p>
              <Words as="h2" id="rec-title" text={DAY_RECORD.title} className="lp-display lp-rec-headline" />
              <Words as="p" text={DAY_RECORD.body} className="lp-rec-body" />
              <ol className="lp-cues lp-mono">
                {DAY_RECORD.cues.map((c, i) => (
                  <li key={c} className="lp-cue is-on" data-cue="" data-rev="" style={d(i, 70)}>{c}</li>
                ))}
              </ol>
              <p className="lp-status lp-mono" data-status="" data-rev="">{DAY_RECORD.status[LAST]}</p>
              <div className="lp-meter" aria-hidden="true"><i /></div>
            </div>

            <div>
              <div className="lp-packet" role="img" aria-label="A day record slip for Baner Residency, Tower A, approved and ready for wages">
                <div className="lp-packet-top" aria-hidden="true">
                  <p className="lp-mono">{DAY_RECORD.header}</p>
                  <p className="lp-display lp-packet-name">{DAY_RECORD.name}</p>
                  <canvas data-plate="site" />
                </div>
                <div className="lp-perf" aria-hidden="true" />
                <div className="lp-packet-stub lp-mono" aria-hidden="true">
                  {DAY_RECORD.rows.map((r, i) => (
                    <p key={r.label} className="lp-prow" data-rev="" style={d(i, 90)}>
                      <span>{r.label}</span>
                      <b data-row-value={i}>{r.values[LAST]}</b>
                    </p>
                  ))}
                </div>
              </div>
              <p className="lp-tear lp-mono">{DAY_RECORD.tear}</p>
            </div>
          </div>
        </section>

        {/* 5 · Wage period band */}
        <section id="wages" className="lp-stage lp-wages" style={{ "--h": "300svh" } as Vars} data-stage="wages" aria-labelledby="wages-title">
          <div className="lp-pin">
            <canvas data-live="contours" aria-hidden="true" />
            <div className="lp-wages-body">
              <Words as="h2" id="wages-title" text={WAGES.title} className="lp-display lp-wages-headline" />
              <ol className="lp-chapters">
                {WAGES.chapters.map((c, i) => (
                  <li key={c.n} className="lp-chapter is-on" data-chapter="" data-rev="" style={d(i, 100)}>
                    <p className="lp-mono lp-role" data-rev="" style={d(i, 100)}>{c.n}</p>
                    <h3 className="lp-display">{c.title}</h3>
                    <p>{c.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Who does what */}
        <section className="lp-band" aria-labelledby="roles-title">
          <Words as="h2" id="roles-title" text={ROLES.title} className="lp-display lp-band-headline" />
          <table className="lp-table">
            <caption className="sr-only">{ROLES.title}</caption>
            <thead className="lp-mono lp-muted">
              <tr>{ROLES.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {ROLES.rows.map((row, i) => (
                <tr key={row[0]} data-rev="" style={d(i, 80)}>
                  {row.map((cell, j) =>
                    j === 0 ? (
                      <td key={cell} className="lp-display">{cell}</td>
                    ) : (
                      <td key={cell} className={j === 2 ? "lp-muted" : undefined} data-rev="" style={d(i + j, 60)}>{cell}</td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* FAQ */}
        <section id="faq" className="lp-band" style={{ paddingTop: 0 }} aria-labelledby="faq-title">
          <Words as="h2" id="faq-title" text="Questions" className="lp-display lp-band-headline" />
          <div className="lp-faq">
            {FAQ.map((f, i) => (
              <details key={f.q} data-rev="" style={d(i, 70)}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="lp-foot on-loam">
        <Words as="h2" text={CTA.title} className="lp-display lp-foot-headline" />
        <Words as="p" text={CTA.body} className="lp-foot-body" />
        <div className="lp-foot-actions">
          <Link href={CTA.primary.href} className="lp-btn lp-btn-red lp-mono" data-rev="" style={d(1)}>{CTA.primary.label}</Link>
          <Link href={CTA.secondary.href} className="lp-btn lp-btn-cream lp-mono" data-rev="" style={d(2)}>{CTA.secondary.label}</Link>
        </div>
        <div className="lp-foot-base lp-mono">
          <span data-rev="" style={d(0)}><Wordmark /></span>
          <span data-rev="" style={d(1)}>Offline-first site records for construction contractors in India</span>
          <span data-rev="" style={d(2)}>© {new Date().getFullYear()} Alarsio</span>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}

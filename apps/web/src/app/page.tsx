import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { CTA, DAY_TABS, FAQ, HERO, OFFICE_CARDS, PROBLEMS, RECORD_STATES, ROLES } from "@/lib/landing/content";
import { DayTabs } from "@/components/landing/day-tabs";
import { SiteHeader, Wordmark } from "@/components/landing/site-header";
import { StatusChip } from "@/components/landing/status-chip";
import { BrowserFrame, CheckInScreen, OverviewScreen, PhoneFrame } from "@/components/landing/screens";

export const metadata: Metadata = {
  title: "Alarsio · Site records that work with no signal",
  description:
    "Attendance, daily reports and materials captured offline on site, and wages built from approved attendance. For contractors running 2 to 20 sites."
};

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const primary = `inline-flex h-12 items-center justify-center rounded-[10px] bg-accent px-6 font-semibold text-ink transition-colors duration-150 hover:bg-accent-hover ${focus}`;
const secondary = `inline-flex h-12 items-center justify-center rounded-[10px] border border-line bg-surface px-6 font-semibold text-ink transition-colors duration-150 hover:bg-canvas ${focus}`;
const container = "mx-auto max-w-[1200px] px-6 lg:px-12";
const h2 = "text-3xl font-extrabold leading-[1.1] tracking-[-0.015em] text-ink lg:text-[44px]";

function Tick() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0">
      <circle cx="10" cy="10" r="10" className="fill-accent" />
      <path d="m6 10.5 2.5 2.5L14 7.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" />
    </svg>
  );
}

// The public landing page (docs/DESIGN.md section 4). A signed-in visitor goes
// straight to their dashboard, as / always did.
export default async function Home() {
  const supabase = await supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="bg-canvas text-ink">
      <a href="#main" className={`sr-only rounded-md bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 ${focus}`}>
        Skip to content
      </a>
      <SiteHeader />

      <main id="main">
        {/* Hero */}
        <section className={`${container} grid gap-12 py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24`}>
          <div>
            <p className="text-sm font-semibold text-ink-muted lg:text-base">{HERO.eyebrow}</p>
            <h1 className="mt-3 text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] lg:text-[56px]">
              {HERO.headline.map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted lg:text-xl">{HERO.lead}</p>
            <ul className="mt-8 space-y-3">
              {HERO.ticks.map((t) => (
                <li key={t} className="flex gap-3 text-base lg:text-lg">
                  <Tick />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href={CTA.primary.href} className={primary}>{CTA.primary.label}</Link>
              <a href="#how-it-works" className={secondary}>See how it works</a>
            </div>
          </div>

          {/* The phone overlaps only the overview's wide left padding, so no row is covered.
              On a phone the hero shows the overview alone; the phone screens follow below. */}
          <div className="flex items-center">
            <div className="relative z-10 hidden shrink-0 sm:block">
              <PhoneFrame label="Phone screen: checked in at the site, on the server">
                <CheckInScreen />
              </PhoneFrame>
            </div>
            <div className="min-w-0 flex-1 sm:-ml-14">
              <BrowserFrame label="The owner's overview: each site's report and attendance for the day">
                <OverviewScreen inset />
              </BrowserFrame>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section aria-labelledby="problem-title" className="border-y border-line bg-surface py-16 lg:py-24">
          <div className={container}>
            <h2 id="problem-title" className={`${h2} max-w-2xl`}>The record exists. Nobody can trust it.</h2>
            <ul className="mt-12 grid gap-4 md:grid-cols-3">
              {PROBLEMS.map((p) => (
                <li key={p.title} className="rounded-2xl bg-canvas p-6">
                  <h3 className="text-xl font-bold">{p.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-muted">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* A day on site */}
        <section id="how-it-works" aria-labelledby="day-title" className="scroll-mt-20 py-16 lg:py-24">
          <div className={container}>
            <h2 id="day-title" className={`${h2} text-center`}>A day on site, on one phone</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-ink-muted">
              Four things a supervisor does every day, each a few taps, each saved on the phone first.
            </p>
            <div className="mt-12">
              <DayTabs tabs={DAY_TABS} />
            </div>
          </div>
        </section>

        {/* Offline */}
        <section id="offline" aria-labelledby="offline-title" className="scroll-mt-20 bg-surface py-16 lg:py-24">
          <div className={`${container} grid gap-12 lg:grid-cols-2 lg:items-center`}>
            <div>
              <p className="text-sm font-semibold text-ink-muted lg:text-base">Built for no signal</p>
              <h2 id="offline-title" className={`${h2} mt-2`}>It never says “done” before the server has it.</h2>
              <p className="mt-6 text-lg leading-relaxed text-ink-muted">
                Basements, rooftops, sites at the edge of town. Every record is saved on the phone the moment it is typed and sent
                when a connection comes back. Each one shows exactly where it is.
              </p>
            </div>
            <ol className="space-y-3">
              {RECORD_STATES.map((s, i) => (
                <li key={s.word} className="flex gap-4 rounded-2xl border border-line bg-canvas p-5">
                  <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <StatusChip tone={s.tone}>{s.word}</StatusChip>
                    <p className="mt-2 text-ink-muted">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Office */}
        <section id="office" aria-labelledby="office-title" className="scroll-mt-20 py-16 lg:py-24">
          <div className={container}>
            <h2 id="office-title" className={`${h2} text-center`}>From the site to the office, the same day</h2>
            <ul className="mt-12 grid gap-4 md:grid-cols-2">
              {OFFICE_CARDS.map((c) => (
                <li key={c.title} className="rounded-3xl bg-surface p-6 lg:p-8">
                  <h3 className="text-2xl font-bold tracking-[-0.01em] lg:text-[30px] lg:leading-tight">{c.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-ink-muted lg:text-lg">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Roles */}
        <section aria-labelledby="roles-title" className="border-y border-line bg-surface py-16 lg:py-24">
          <div className={container}>
            <h2 id="roles-title" className={h2}>Four roles. Each sees what it needs.</h2>
            <dl className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((r) => (
                <div key={r.role} className="border-t-4 border-accent pt-4">
                  <dt className="text-lg font-bold">{r.role}</dt>
                  <dd className="mt-2 leading-relaxed text-ink-muted">{r.does}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 py-16 lg:py-24">
          <div className="mx-auto max-w-3xl px-6">
            <h2 id="faq-title" className={`${h2} text-center`}>Questions</h2>
            <div className="mt-12 divide-y divide-line rounded-3xl bg-surface">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6">
                  <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-md text-lg font-semibold ${focus} [&::-webkit-details-marker]:hidden`}>
                    {f.q}
                    <span aria-hidden className="text-2xl text-ink-muted transition-transform duration-150 group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-6 leading-relaxed text-ink-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Dark band */}
        <section aria-labelledby="cta-title" className="bg-night py-16 text-center lg:py-24">
          <div className="mx-auto max-w-2xl px-6">
            <h2 id="cta-title" className="text-3xl font-extrabold leading-[1.1] tracking-[-0.015em] text-white lg:text-[44px]">{CTA.title}</h2>
            <p className="mt-4 text-lg text-night-muted">{CTA.body}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={CTA.primary.href} className={`${primary} focus-visible:outline-white`}>{CTA.primary.label}</Link>
              <Link href={CTA.secondary.href} className={`inline-flex h-12 items-center rounded-[10px] border border-night-muted px-6 font-semibold text-white ${focus} focus-visible:outline-white`}>
                {CTA.secondary.label}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface py-10">
        <div className={`${container} flex flex-col gap-6 md:flex-row md:items-center md:justify-between`}>
          <div>
            <Wordmark />
            <p className="mt-2 max-w-sm text-sm text-ink-muted">Offline-first site records for construction contractors in India.</p>
          </div>
          <p className="text-sm text-ink-muted">© {new Date().getFullYear()} Alarsio</p>
        </div>
      </footer>
    </div>
  );
}

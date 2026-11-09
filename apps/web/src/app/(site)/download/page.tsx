import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/site/eyebrow";
import { PhoneMock } from "@/components/landing/screen-mocks";
import { CTA } from "@/lib/landing/content";
import { CONTACT_WHATSAPP, whatsAppHref } from "@/lib/site/contact";
import { APK_URL } from "@/lib/site/download";
import "@/app/home.css";
import "./download.css";

export const metadata: Metadata = {
  title: "Download the Android app",
  description: "Get the Alarsio Android app for supervisors and project managers: attendance, daily reports and materials, even with no signal.",
  alternates: { canonical: "/download" }
};

// The file size is stated once, so the facts row and step 1 cannot disagree.
// A non-breaking space keeps the number and its unit on one line.
const APP_SIZE = "about 100\u00a0MB";

const FACTS = [`Download ${APP_SIZE}`, "Works with no signal", "Free during the pilot"];

const STEPS = [
  { title: "Download the app", body: `Open this page on your Android phone and tap Download for Android. The file is ${APP_SIZE}, so use Wi-Fi if you can.` },
  { title: "Allow the install", body: "Android asks whether to allow apps from this source. Allow it once for your browser, then tap Install." },
  { title: "Sign in", body: "Open Alarsio and sign in with the email and password from the invite your owner sent you. Your sites download while you have signal." }
];

const n = (i: number) => String(i + 1).padStart(2, "0");

// Download, in the home page's look (docs/DESIGN.md section 2). The pilot app is an APK, so this
// page explains the one unusual step (allowing the install). When the link is not configured the
// page points to WhatsApp or Contact instead of a dead button.
export default function DownloadPage() {
  const whatsApp = whatsAppHref(CONTACT_WHATSAPP);
  const help = whatsApp ? (
    <a href={whatsApp} target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>
  ) : (
    <Link href="/contact">contact us</Link>
  );
  return (
    <div className="hm">
      <section className="hm-band dl-hero" aria-labelledby="download-title">
        <div className="hm-wrap dl-grid">
          <div>
            <Eyebrow>Pilot version</Eyebrow>
            <h1 id="download-title" className="lp-display hm-h1">Alarsio for Android.</h1>
            <p className="hm-lede">
              Built for supervisors and project managers. Check in, mark the register, file the daily report and log
              materials on site, even with no signal.
            </p>
            {APK_URL ? (
              <>
                <div className="hm-actions">
                  <a href={APK_URL} className="lp-pill lp-pill-red">Download for Android</a>
                  <Link href="/sign-in" className="lp-pill lp-pill-line">Use the web app instead</Link>
                </div>
                <p className="dl-hint">Open this page on the Android phone you use on site, then tap Download.</p>
              </>
            ) : (
              <>
                <p className="dl-hint">
                  The pilot app is shared directly while we finish the Play Store listing. Ask us and we will send the link.
                </p>
                <div className="hm-actions">
                  {whatsApp ? (
                    <a href={whatsApp} className="lp-pill lp-pill-red" target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
                  ) : (
                    <Link href="/contact" className="lp-pill lp-pill-red">Contact us</Link>
                  )}
                </div>
              </>
            )}
            <ul className="dl-facts" aria-label="At a glance">
              {FACTS.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
          <div className="dl-visual">
            <PhoneMock />
            <p className="hm-caption">Sample sites and figures</p>
          </div>
        </div>
      </section>

      <section className="hm-band hm-paper" aria-labelledby="install-title">
        <div className="hm-wrap">
          <Eyebrow>How to install</Eyebrow>
          <h2 id="install-title" className="lp-display hm-h2">Three steps to get started.</h2>
          <ol className="hm-steps dl-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="hm-rev">
                <span className="hm-step-n" aria-hidden="true">{n(i)}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="dl-help">Stuck on a step? Please {help} and we will help you get installed.</p>
        </div>
      </section>

      <section className="hm-band" aria-labelledby="who-title">
        <div className="hm-wrap">
          <Eyebrow>Which app</Eyebrow>
          <h2 id="who-title" className="lp-display hm-h2">Phone or web?</h2>
          <ul className="dl-two">
            <li className="hm-card hm-rev">
              <p className="hm-num">01 · Android</p>
              <h3>Phone app</h3>
              <p>For supervisors and project managers. Everything is saved on the phone first and sent when a connection comes back.</p>
            </li>
            <li className="hm-card hm-rev">
              <p className="hm-num">02 · Any browser</p>
              <h3>Web app</h3>
              <p>
                For owners and accountants: sites, team, approvals, wages and exports. Project managers can use it too.{" "}
                <Link href="/sign-in">Sign in</Link>
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="hm-cta" aria-labelledby="download-cta-title">
        <div className="hm-wrap">
          <h2 id="download-cta-title" className="lp-display hm-cta-title">{CTA.title}</h2>
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

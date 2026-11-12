import type { Metadata } from "next";
import Link from "next/link";
import { ClosingCta } from "@/components/site/closing-cta";
import { Eyebrow } from "@/components/site/eyebrow";
import { PageHero } from "@/components/site/page-hero";
import { CONTACT_WHATSAPP, whatsAppHref } from "@/lib/site/contact";
import { APK_URL, PILOT_APK, PILOT_APK_URL, apkFacts } from "@/lib/site/download";

export const metadata: Metadata = {
  title: "Download the Android app",
  description: "Get the Alarsio Android app for supervisors and project managers: attendance, daily reports and materials, even with no signal.",
  alternates: { canonical: "/download" }
};

const STEPS = [
  { title: "Download the app", body: "Tap the button on your Android phone. The file is about 110 MB, so use Wi-Fi if you can." },
  { title: "Allow the install", body: "Android asks whether to allow apps from this source. Allow it once for your browser, then tap Install." },
  { title: "Sign in", body: "Open Alarsio and sign in with the email and password from the invite your owner sent you. Your sites download while you have signal." }
];

const n = (i: number) => String(i + 1).padStart(2, "0");

// The pilot app is an APK, so this page explains the one unusual step (allowing the install).
// When the link is not configured the page points to WhatsApp or Contact instead of a dead button.
// In the About look (docs/DESIGN.md 2b-i): hero with the buttons, the steps, phone or web, closing band.
export default function DownloadPage() {
  const whatsApp = whatsAppHref(CONTACT_WHATSAPP);
  return (
    <div className="hm">
      <PageHero
        crumb="Download"
        eyebrow="Pilot version"
        title="Get the Android app"
        lede={
          APK_URL
            ? "For supervisors and project managers. Check in, mark the register, file the daily report and log materials, even with no signal. Open this page on the Android phone you use on site, then tap the button."
            : "For supervisors and project managers. Check in, mark the register, file the daily report and log materials, even with no signal. The pilot app is shared directly while we finish the Play Store listing. Ask us and we will send the link."
        }
      >
        <div className="hm-actions">
          {APK_URL ? (
            <>
              <a href={APK_URL} className="lp-pill lp-pill-red">Download for Android</a>
              <Link href="/sign-in" className="lp-pill lp-pill-line">Use the web app instead</Link>
            </>
          ) : whatsApp ? (
            <a href={whatsApp} className="lp-pill lp-pill-red" target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
          ) : (
            <Link href="/contact" className="lp-pill lp-pill-red">Contact us</Link>
          )}
        </div>
        {/* Only for the build these facts describe: a link set through NEXT_PUBLIC_APK_URL may be another. */}
        {APK_URL === PILOT_APK_URL ? <p className="hm-note">{apkFacts(PILOT_APK)} · Android only</p> : null}
      </PageHero>

      <section className="hm-band hm-paper" aria-labelledby="install">
        <div className="hm-wrap">
          <Eyebrow>Three steps</Eyebrow>
          <h2 id="install" className="lp-display hm-h2">Install it.</h2>
          <ol className="hm-grid hm-grid-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="hm-card hm-rev">
                <p className="hm-num">Step {n(i)}</p>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="hm-band hm-dark" aria-labelledby="who">
        <div className="hm-wrap">
          <Eyebrow>Who needs it</Eyebrow>
          <h2 id="who" className="lp-display hm-h2">Phone or web?</h2>
          <div className="hm-grid hm-grid-3">
            <div className="hm-card hm-card-dark hm-rev">
              <p className="hm-num">Phone app</p>
              <h3>Supervisors and project managers</h3>
              <p>Everything is saved on the phone first and sent when a connection comes back.</p>
            </div>
            <div className="hm-card hm-card-dark hm-rev">
              <p className="hm-num">Web app</p>
              <h3>Owners and accountants</h3>
              <p>Work in the browser: sites, team, approvals, wages and exports.</p>
              <Link href="/sign-in" className="pg-link">Sign in →</Link>
            </div>
          </div>
        </div>
      </section>

      <ClosingCta />
    </div>
  );
}

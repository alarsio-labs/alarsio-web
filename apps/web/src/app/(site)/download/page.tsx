import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/site/doc";
import { CONTACT_WHATSAPP, whatsAppHref } from "@/lib/site/contact";
import { APK_URL } from "@/lib/site/download";

export const metadata: Metadata = {
  title: "Download the Android app",
  description: "Get the Alarsio Android app for supervisors and project managers: attendance, daily reports and materials, even with no signal.",
  alternates: { canonical: "/download" }
};

const STEPS = [
  { title: "Download the app", body: "Tap the button on your Android phone. The file is about 100 MB, so use Wi-Fi if you can." },
  { title: "Allow the install", body: "Android asks whether to allow apps from this source. Allow it once for your browser, then tap Install." },
  { title: "Sign in", body: "Open Alarsio and sign in with the email and password from the invite your owner sent you. Your sites download while you have signal." }
];

// The pilot app is an APK, so this page explains the one unusual step (allowing the install).
// When the link is not configured the page points to WhatsApp or Contact instead of a dead button.
export default function DownloadPage() {
  const whatsApp = whatsAppHref(CONTACT_WHATSAPP);
  return (
    <>
      <PageHead
        crumb="Download"
        title="Get the Android app"
        sub="For supervisors and project managers. Check in, mark the register, file the daily report and log materials, even with no signal."
      />
      <div className="ds-wrap">
        <section className="ds-section" aria-labelledby="get">
          <span className="ds-kicker">Pilot version</span>
          <h2 id="get">Download</h2>
          {APK_URL ? (
            <>
              <p>Open this page on the Android phone you use on site, then tap the button.</p>
              <div className="ds-cta-actions">
                <a href={APK_URL} className="lp-pill lp-pill-red">Download for Android</a>
                <Link href="/sign-in" className="lp-pill lp-pill-line">Use the web app instead</Link>
              </div>
            </>
          ) : (
            <>
              <p>The pilot app is shared directly while we finish the Play Store listing. Ask us and we will send the link.</p>
              <div className="ds-cta-actions">
                {whatsApp ? (
                  <a href={whatsApp} className="lp-pill lp-pill-red" target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
                ) : (
                  <Link href="/contact" className="lp-pill lp-pill-red">Contact us</Link>
                )}
              </div>
            </>
          )}
        </section>

        <section className="ds-section" aria-labelledby="install">
          <span className="ds-kicker">Three steps</span>
          <h2 id="install">Install it</h2>
          <ol className="ds-grid ds-grid-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {STEPS.map((s, i) => (
              <li key={s.title} className="ds-card">
                <span className="ds-kicker">Step {i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="ds-section" aria-labelledby="who">
          <span className="ds-kicker">Who needs it</span>
          <h2 id="who">Phone or web?</h2>
          <div className="ds-grid">
            <div className="ds-card">
              <h3>Phone app</h3>
              <p>Supervisors and project managers. Everything is saved on the phone first and sent when a connection comes back.</p>
            </div>
            <div className="ds-card">
              <h3>Web app</h3>
              <p>
                Owners and accountants work in the browser: sites, team, approvals, wages and exports.{" "}
                <Link href="/sign-in">Sign in</Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

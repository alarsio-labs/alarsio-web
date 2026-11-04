import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "Alarsio keeps attendance, daily reports, materials and wages for contractors running 2 to 20 sites, offline first.",
  alternates: { canonical: "/about" }
};

export default function AboutPage() {
  return (
    <article className="lp-doc">
      <p className="lp-mono lp-muted">About</p>
      <h1 className="lp-display lp-doc-title">Site records with no signal</h1>
      <p className="lp-doc-lead">
        Alarsio is a record-keeping tool for construction contractors in India. The people on site capture the day
        on a phone, even with no network, and the office turns approved records into wages.
      </p>

      <h2>The problem</h2>
      <p>
        On most sites the day lives in notebooks, photos and WhatsApp messages. At month end someone rebuilds
        attendance and materials from memory, and wage disputes follow. Apps that need a connection fail exactly
        where the work happens.
      </p>

      <h2>What it does</h2>
      <ul>
        <li><strong>Attendance</strong> marked on site and approved by a supervisor or manager.</li>
        <li><strong>Daily reports</strong> with work done, photos and notes.</li>
        <li><strong>Materials</strong> received and used, per site.</li>
        <li><strong>Wages</strong> built from approved attendance, with a record of every correction.</li>
      </ul>

      <h2>Offline first</h2>
      <p>
        The Android app saves everything on the phone first and syncs when a connection returns. Nothing is lost
        because a tower was down. The office uses the web app in any modern browser.
      </p>

      <h2>Your data is yours</h2>
      <p>
        Each company&apos;s records are separated from every other company&apos;s, and the owner can download all of
        the company&apos;s data as CSV files at any time. Read more in our <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <div className="lp-doc-actions">
        <Link href="/sign-up" className="lp-btn lp-btn-ink lp-mono">Create your company account</Link>
        <Link href="/contact" className="lp-btn lp-btn-line lp-mono">Talk to us</Link>
      </div>
    </article>
  );
}

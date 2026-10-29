import type { ReactNode } from "react";
import Link from "next/link";
import { FieldCanvas } from "@/components/landing/field-canvas";
import { HERO } from "@/lib/landing/content";
import { anton, mono } from "../fonts";
import "../landing.css";
import "../v2-form.css";
import "./auth.css";

// The sign-in pages in the landing page's look (docs/DESIGN.md v2): a dark panel
// with the drifting site grid beside a form on the cream ground. On a phone the
// panel shrinks to a band above the form.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`lp au ${anton.variable} ${mono.variable}`}>
      <aside className="au-panel on-loam">
        <FieldCanvas className="au-field" />
        <Link href="/" className="lp-display lp-wordmark au-wordmark" aria-label="Alarsio, home">
          Alar<span>sio</span>
        </Link>
        <p className="lp-display au-poster" aria-hidden="true">
          Site records
          <br />
          with no signal
        </p>
        <ul className="lp-mono au-meta" aria-label="At a glance">
          {HERO.meta.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </aside>
      <main className="au-main">
        <div className="au-card">{children}</div>
      </main>
    </div>
  );
}

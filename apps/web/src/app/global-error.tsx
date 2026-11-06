"use client";

import { CONTACT_EMAIL } from "@/lib/site/contact";

// The last resort: the root layout itself failed, so this draws its own <html> and <body> with
// inline styles in the DESIGN.md colours (cream, ink, red). It shows no error text.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const button = {
    minHeight: 48, padding: "0 20px", border: "1.5px solid #171717", borderRadius: 0, font: "inherit", fontWeight: 600,
    cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center"
  } as const;
  return (
    <html lang="en-IN">
      <body style={{ margin: 0, background: "#e7e2d8", color: "#171717", fontFamily: "system-ui, sans-serif" }}>
        <main id="main" style={{ maxWidth: 560, margin: "0 auto", padding: "96px 24px" }}>
          <p style={{ margin: 0, color: "#56524c", fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase" }}>Alarsio</p>
          <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: "12px 0" }}>Something went wrong</h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "#56524c" }}>Try again, or go back to the start.</p>
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => reset()} style={{ ...button, background: "#171717", color: "#e7e2d8" }}>Try again</button>
            <a href="/" style={{ ...button, background: "transparent", color: "#171717" }}>Home</a>
          </p>
          {CONTACT_EMAIL ? (
            <p style={{ color: "#56524c" }}>
              If it keeps happening, write to <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#b92725" }}>{CONTACT_EMAIL}</a>.
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}

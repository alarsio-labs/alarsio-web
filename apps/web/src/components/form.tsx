import type { ReactNode } from "react";
import { AuthHeading } from "./v2-form";

// The app's shared form pieces, now in the v2 look (docs/DESIGN.md). The classes come
// from app/v2-form.css and app/landing.css, which the (app) and (auth) layouts load.

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="au-field-row">
      <span className="lp-mono">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "au-input";

/** The v2 button with no width, for a button sitting beside a field in a row. */
export const buttonBase = "lp-btn lp-btn-ink lp-mono cursor-pointer disabled:opacity-60";

// Full width as a Tailwind utility, not in v2-form.css, so sm:w-auto can narrow it.
// Plain w-auto cannot (Tailwind emits it before w-full); use buttonBase instead.
export const buttonClass = `${buttonBase} w-full`;

export function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`au-notice ${kind === "error" ? "au-notice-error" : ""}`}>
      {children}
    </p>
  );
}

/** A titled block on the sign-in pages' layout (used by the invite page). */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <AuthHeading eyebrow="Invitation" title={title} />
      <div className="au-body-block">{children}</div>
    </>
  );
}

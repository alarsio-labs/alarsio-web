import type { ReactNode } from "react";

// Form pieces for the sign-in pages only (docs/DESIGN.md v2). The app's own pages
// keep components/form.tsx until they move to the v2 tokens.

export function AuthHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="au-heading">
      <p className="lp-mono lp-muted">{eyebrow}</p>
      <h1 className="lp-display">{title}</h1>
    </div>
  );
}

export function AuthField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="au-field-row">
      <span className="lp-mono">{label}</span>
      {children}
      {hint && <span className="lp-mono lp-muted au-hint">{hint}</span>}
    </label>
  );
}

export const authInput = "au-input";
export const authButton = "lp-btn lp-btn-ink lp-mono au-submit";

export function AuthNotice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`au-notice ${kind === "error" ? "au-notice-error" : ""}`}>
      {children}
    </p>
  );
}

export function AuthFoot({ children }: { children: ReactNode }) {
  return <p className="au-foot">{children}</p>;
}

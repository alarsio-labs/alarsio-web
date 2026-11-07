import type { ReactNode } from "react";

// The pieces every sign-in page is built from (docs/DESIGN.md section 2b, v3). Styles are in
// app/(auth)/auth.css. Each page picks a tone, a picture for wide screens and a small header
// for phones, so the pages share one look but are not copies of each other.

export type AuthTone = "warm" | "fresh" | "mail" | "alert" | "key" | "invite";

export function AuthScene({
  tone,
  visual,
  mobileTop,
  children
}: {
  tone: AuthTone;
  visual: ReactNode;
  mobileTop?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`sx-scene sx-tone-${tone}`}>
      <div className="sx-visual" aria-hidden="true">
        {visual}
      </div>
      <section className="sx-side">
        {mobileTop && (
          <div className="sx-mtop" aria-hidden="true">
            {mobileTop}
          </div>
        )}
        <div className="sx-card">{children}</div>
      </section>
    </div>
  );
}

export function AuthTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <header className="sx-head">
      <h1 className="sx-title">{title}</h1>
      {sub && <p className="sx-sub">{sub}</p>}
    </header>
  );
}

export type NoticeKind = "error" | "success" | "info" | "warn";

const NOTICE_ICON: Record<NoticeKind, ReactNode> = {
  error: <path d="M12 8v5m0 3h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  warn: <path d="M12 7v6m0 3.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  success: <path d="m8 12.5 2.7 2.7L16.5 9.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  info: <path d="M12 11v5m0-8.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
};

/** A message under the title. Errors are announced at once; the others politely. */
export function AuthNotice({ kind, children }: { kind: NoticeKind; children: ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`sx-notice sx-notice-${kind}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {NOTICE_ICON[kind]}
      </svg>
      <p>{children}</p>
    </div>
  );
}

export function AuthFoot({ children }: { children: ReactNode }) {
  return <div className="sx-foot">{children}</div>;
}

/** A labelled text input. The label wraps the input, so tapping the label focuses it. */
export function AuthField({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="sx-field">
      <span className="sx-label">{label}</span>
      <input className="sx-input" {...input} />
      {hint && <span className="sx-hint">{hint}</span>}
    </label>
  );
}

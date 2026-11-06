import type { ReactNode } from "react";

// A white card with a hairline border, a faint shadow and an optional title row
// with one action (docs/DESIGN.md section 4).
export function Card({ title, action, children, id }: { title?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="ax-card" aria-labelledby={title && id ? id : undefined}>
      {(title || action) && (
        <div className="ax-card-head">
          {title && <h2 id={id} className="ax-card-title">{title}</h2>}
          {action}
        </div>
      )}
      <div className="ax-card-body">{children}</div>
    </section>
  );
}

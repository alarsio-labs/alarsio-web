import type { ReactNode } from "react";

// A paper card with a 1.5 px ink border and an optional Anton title and action.
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

import type { ReactNode } from "react";

// The head of a working screen: a mono eyebrow, the Anton title and one optional
// action on the right (it drops under the title on a phone).
export function PageHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="ax-head">
      <div className="ax-head-text">
        {eyebrow && <p className="ax-eyebrow">{eyebrow}</p>}
        <h1 className="ax-title">{title}</h1>
      </div>
      {action && <div className="ax-head-action">{action}</div>}
    </header>
  );
}

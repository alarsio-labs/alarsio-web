import type { ReactNode } from "react";

// The head of a page in the app console: a large light title, a one-line note under
// it (the eyebrow), and on the right an optional control (`aside`, such as a
// segmented day switch) and one action. Both drop under the title on a phone. The
// breadcrumb above it comes from the frame.
export function PageHead({
  eyebrow,
  title,
  action,
  aside
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="ax-head">
      <div className="ax-head-text">
        {eyebrow && <p className="ax-eyebrow">{eyebrow}</p>}
        <h1 className="ax-title">{title}</h1>
      </div>
      {(aside || action) && (
        <div className="ax-head-action">
          {aside}
          {action}
        </div>
      )}
    </header>
  );
}

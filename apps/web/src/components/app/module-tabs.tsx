import Link from "next/link";
import type { OrgLink } from "@/lib/dashboard/links";

// The row of module tabs under the top bar, one per page the user's role may open
// (lib/dashboard/links.ts). The current tab is ink with paper text. Below 768 px the
// row folds into a native <details> "Menu", so it works without JavaScript.
export function ModuleTabs({ links, current }: { links: readonly OrgLink[]; current: string | null }) {
  if (links.length === 0) return null;
  const tab = (l: OrgLink) => (
    <li key={l.path}>
      <Link href={l.path} className="ax-tab" aria-current={l.path === current ? "page" : undefined}>
        {l.label}
      </Link>
    </li>
  );
  const here = links.find((l) => l.path === current);
  return (
    <nav className="ax-tabs" aria-label="Modules">
      <ul className="ax-tabs-row">{links.map(tab)}</ul>
      <details className="ax-tabs-menu">
        <summary className="ax-tab ax-menu-button">Menu{here ? ` · ${here.label}` : ""}</summary>
        <ul className="ax-menu-list">{links.map(tab)}</ul>
      </details>
    </nav>
  );
}

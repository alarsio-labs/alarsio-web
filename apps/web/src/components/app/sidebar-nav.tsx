import Link from "next/link";
import type { OrgLink } from "@/lib/dashboard/links";
import { Icon, iconForPath } from "./nav-icon";

// The module list for the user's role in this organisation (lib/dashboard/links.ts),
// one link per page the role may open. The same list draws in the desktop sidebar and
// in the phone menu (docs/DESIGN.md section 4). The current page has aria-current.
export function SidebarNav({ links, current }: { links: readonly OrgLink[]; current: string | null }) {
  if (links.length === 0) return null;
  return (
    <ul className="cx-nav">
      {links.map((l) => {
        const icon = iconForPath(l.path);
        return (
          <li key={l.path}>
            <Link href={l.path} className="cx-nav-link" aria-current={l.path === current ? "page" : undefined}>
              {icon && <Icon name={icon} />}
              <span>{l.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

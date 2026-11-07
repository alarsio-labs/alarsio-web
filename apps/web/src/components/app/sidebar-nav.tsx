import Link from "next/link";
import type { OrgLink } from "@/lib/dashboard/links";
import { Icon, iconForPath } from "./nav-icon";

// The module links for the user's role in this organisation (lib/dashboard/links.ts),
// one per page the role may open (docs/DESIGN.md section 4). "pills" is the row in
// the top bar on a wide screen; "list" is the same links stacked in the Menu. The
// current page has aria-current.
export function SidebarNav({
  links,
  current,
  variant = "list"
}: {
  links: readonly OrgLink[];
  current: string | null;
  variant?: "pills" | "list";
}) {
  if (links.length === 0) return null;
  return (
    <ul className={variant === "pills" ? "cx-pills" : "cx-nav"}>
      {links.map((l) => {
        const icon = variant === "list" ? iconForPath(l.path) : null;
        return (
          <li key={l.path}>
            <Link
              href={l.path}
              className={variant === "pills" ? "cx-pill" : "cx-nav-link"}
              aria-current={l.path === current ? "page" : undefined}
            >
              {icon && <Icon name={icon} />}
              <span>{l.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

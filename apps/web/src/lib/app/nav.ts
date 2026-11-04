import type { OrgLink } from "@/lib/dashboard/links";

/**
 * The module tab to mark as current for a pathname: the link whose path (without its
 * query) is the pathname or a parent of it, so /sites/<id> keeps "Sites" active.
 * Null when the page is not one of the tabs.
 */
export function activeLink(links: readonly OrgLink[], pathname: string): OrgLink | null {
  const path = pathname.split("?")[0] ?? pathname;
  let best: OrgLink | null = null;
  for (const link of links) {
    const base = link.path.split("?")[0] ?? link.path;
    if (path === base || path.startsWith(`${base}/`)) {
      if (!best || base.length > (best.path.split("?")[0] ?? "").length) best = link;
    }
  }
  return best;
}

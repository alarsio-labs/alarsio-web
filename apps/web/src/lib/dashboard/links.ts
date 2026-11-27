import type { AppRole } from "@alarsio/types";

// Which pages the dashboard links an organisation member to, by role. This only
// decides which links are drawn; every page checks the role again, and RLS decides
// what any request can read.

// The four sections match the phone's tabs (docs/DESIGN.md section 5).
export const SECTIONS = ["today", "sites", "reports", "more"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = { today: "Today", sites: "Sites", reports: "Reports", more: "More" };

export type OrgLink = { label: string; path: string; note: string; section: Section };

const LINKS: (OrgLink & { roles: AppRole[] })[] = [
  { label: "Overview", path: "/overview", note: "Every site, one day", section: "today", roles: ["owner", "project_manager"] },
  { label: "Daily reports", path: "/reports", note: "Read, review, send back", section: "reports", roles: ["owner", "project_manager", "supervisor"] },
  { label: "Attendance", path: "/attendance", note: "Approve days and corrections", section: "today", roles: ["owner", "project_manager"] },
  { label: "Sites", path: "/sites", note: "Pins, geofence, supervisors", section: "sites", roles: ["owner", "project_manager"] },
  { label: "Materials", path: "/materials", note: "Stock and alerts", section: "sites", roles: ["owner", "project_manager"] },
  { label: "Workers", path: "/workers", note: "Roster, rates, sites", section: "sites", roles: ["owner", "project_manager", "accountant"] },
  { label: "Wages", path: "/wages", note: "Periods, lock, export", section: "reports", roles: ["owner", "accountant"] },
  { label: "Team", path: "/team", note: "Invite and manage", section: "more", roles: ["owner"] },
  // #135: owners could not find the export page (smoke test S15).
  { label: "Export", path: "/export", note: "Download all your data", section: "reports", roles: ["owner"] }
];

export function orgLinks(role: AppRole, orgId: string): OrgLink[] {
  return LINKS.filter((l) => l.roles.includes(role)).map(({ label, path, note, section }) => ({
    label,
    note,
    section,
    path: `${path}?org=${encodeURIComponent(orgId)}`
  }));
}

/** The sections a role has pages in, in tab order, each with the pages it holds. */
export function groupBySection(links: readonly OrgLink[]): { section: Section; links: OrgLink[] }[] {
  return SECTIONS.map((section) => ({ section, links: links.filter((l) => l.section === section) })).filter((g) => g.links.length > 0);
}

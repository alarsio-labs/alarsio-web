import type { AppRole } from "@alarsio/types";

// Which pages the dashboard links an organisation member to, by role. This only
// decides which links are drawn; every page checks the role again, and RLS decides
// what any request can read.

export type OrgLink = { label: string; path: string; note: string };

const LINKS: (OrgLink & { roles: AppRole[] })[] = [
  { label: "Overview", path: "/overview", note: "Every site, one day", roles: ["owner", "project_manager"] },
  { label: "Daily reports", path: "/reports", note: "Read, review, send back", roles: ["owner", "project_manager", "supervisor"] },
  { label: "Attendance", path: "/attendance", note: "Approve days and corrections", roles: ["owner", "project_manager"] },
  { label: "Sites", path: "/sites", note: "Pins, geofence, supervisors", roles: ["owner", "project_manager"] },
  { label: "Materials", path: "/materials", note: "Stock and alerts", roles: ["owner", "project_manager"] },
  { label: "Workers", path: "/workers", note: "Roster, rates, sites", roles: ["owner", "project_manager", "accountant"] },
  { label: "Wages", path: "/wages", note: "Periods, lock, export", roles: ["owner", "accountant"] },
  { label: "Team", path: "/team", note: "Invite and manage", roles: ["owner"] }
];

export function orgLinks(role: AppRole, orgId: string): OrgLink[] {
  return LINKS.filter((l) => l.roles.includes(role)).map(({ label, path, note }) => ({
    label,
    note,
    path: `${path}?org=${encodeURIComponent(orgId)}`
  }));
}

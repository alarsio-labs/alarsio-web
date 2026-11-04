import { isAppRole, type AppRole } from "@alarsio/types";

// The signed-in user's organisations and roles, as the dashboard and the app frame
// read them from memberships (with the organisation's name), and where each lands.

export type Membership = { orgId: string; orgName: string; role: AppRole };

/** Rows of `memberships.select("org_id, role, organizations(name)")`; a malformed row is skipped. */
export function toMemberships(rows: unknown): Membership[] {
  if (!Array.isArray(rows)) return [];
  const out: Membership[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const org = row.organizations as Record<string, unknown> | null;
    if (typeof row.org_id === "string" && isAppRole(row.role) && org && typeof org.name === "string") {
      out.push({ orgId: row.org_id, orgName: org.name, role: row.role });
    }
  }
  return out;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  project_manager: "Project manager",
  supervisor: "Supervisor",
  accountant: "Accountant"
};

const ROLE_HOME: Record<AppRole, string> = {
  owner: "/overview",
  project_manager: "/overview",
  accountant: "/wages",
  supervisor: "/reports"
};

/**
 * Where the dashboard sends a user (docs/DESIGN.md section 4, "Home after sign-in"):
 * with exactly one organisation, straight to their role's home in it; with none (the
 * create stepper) or several (the hub), nowhere: they stay on the dashboard.
 */
export function homeFor(memberships: readonly Membership[]): string | null {
  if (memberships.length !== 1) return null;
  const [only] = memberships;
  if (!only) return null;
  return `${ROLE_HOME[only.role]}?org=${encodeURIComponent(only.orgId)}`;
}

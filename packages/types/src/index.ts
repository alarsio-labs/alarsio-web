// The four roles and only four (ADR-003). Matches the Postgres enum app_role.
export const APP_ROLES = ["owner", "project_manager", "supervisor", "accountant"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

// Replaced by `supabase gen types typescript` output once a project is linked.
// Until then, hand-written types stay out of this file.

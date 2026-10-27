import { isAppRole, type AppRole } from "@alarsio/types";
import type { MessageCode } from "../messages";
import { UUID } from "../uuid";

// Narrowing and display rules for a site's supervisors. The database is the
// boundary (site_assignments policies, org_member_names' own check); this only
// makes the page's types honest and decides what it shows.

// The page reads at most this many rows, open ones first, so the cap never hides an open assignment.
export const HISTORY_LIMIT = 200;

export type MemberName = { user_id: string; full_name: string | null; role: AppRole };

export type AssignmentRecord = {
  id: string;
  user_id: string;
  assigned_by: string;
  assigned_at: string;
  unassigned_at: string | null;
  unassigned_by: string | null;
};

export function toMemberName(v: unknown): MemberName | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.user_id !== "string" ||
    !UUID.test(o.user_id) ||
    !(o.full_name === null || typeof o.full_name === "string") ||
    typeof o.role !== "string" ||
    !isAppRole(o.role)
  ) {
    return null;
  }
  return { user_id: o.user_id, full_name: o.full_name, role: o.role };
}

export function toAssignmentRecord(v: unknown): AssignmentRecord | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    !UUID.test(o.id) ||
    typeof o.user_id !== "string" ||
    !UUID.test(o.user_id) ||
    typeof o.assigned_by !== "string" ||
    !UUID.test(o.assigned_by) ||
    typeof o.assigned_at !== "string"
  ) {
    return null;
  }
  // The table's CHECK: closed means both stamps, open means neither.
  const at = o.unassigned_at;
  const by = o.unassigned_by;
  if (at === null && by === null) {
    return { id: o.id, user_id: o.user_id, assigned_by: o.assigned_by, assigned_at: o.assigned_at, unassigned_at: null, unassigned_by: null };
  }
  if (typeof at === "string" && typeof by === "string" && UUID.test(by)) {
    return { id: o.id, user_id: o.user_id, assigned_by: o.assigned_by, assigned_at: o.assigned_at, unassigned_at: at, unassigned_by: by };
  }
  return null;
}

const time = (iso: string) => Date.parse(iso);

/** Open rows newest first; closed rows, the most recently removed first. */
export function splitAssignments(rows: AssignmentRecord[]): { open: AssignmentRecord[]; closed: AssignmentRecord[] } {
  const open = rows.filter((r) => r.unassigned_at === null).sort((a, b) => time(b.assigned_at) - time(a.assigned_at));
  const closed = rows
    .filter((r) => r.unassigned_at !== null)
    .sort((a, b) => time(b.unassigned_at ?? "") - time(a.unassigned_at ?? ""));
  return { open, closed };
}

export function memberLabel(members: readonly MemberName[], userId: string): string {
  const m = members.find((x) => x.user_id === userId);
  if (!m) return "Unknown member";
  return m.full_name !== null && m.full_name.trim() !== "" ? m.full_name : "Unnamed member";
}

/** The picker offers supervisors with no open assignment here, in the order the database gave. */
export function eligibleSupervisors(members: readonly MemberName[], open: readonly AssignmentRecord[]): MemberName[] {
  const taken = new Set(open.map((r) => r.user_id));
  return members.filter((m) => m.role === "supervisor" && !taken.has(m.user_id));
}

/** Only the answers a manager can act on. Anything else is the generic message. */
export function assignmentErrorCode(sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "site_forbidden";
  if (sqlstate === "23505") return "assign_exists";
  if (sqlstate === "55000") return "assign_archived";
  if (sqlstate === "23503") return "assign_member";
  return "generic";
}

/** The UTC calendar date of a timestamp, as the archived banner shows it. */
export function utcDate(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "an unknown date" : new Date(ms).toISOString().slice(0, 10);
}

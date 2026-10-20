import type { MessageCode } from "../messages";

export const MAX_REASON = 500;

export type Decision = "approve" | "reject";

// True when the viewer wrote the day or any of its entries. A person holds one
// role per organisation, so this is false for every reviewer unless an owner
// changed their role after they recorded; the database does not check it (ADR-034).
export function recordedByViewer(v: { dayRecordedBy: string; entryRecorders: readonly string[]; viewerId: string }): boolean {
  return v.dayRecordedBy === v.viewerId || v.entryRecorders.includes(v.viewerId);
}

// These decide only whether to draw the buttons. review_attendance_day and
// review_attendance_correction check can_review_site again and are the boundary:
// a wrong answer here shows a button that the database then refuses.
export function canReviewDay(v: {
  canReview: boolean;
  status: string;
  dayRecordedBy: string;
  entryRecorders: readonly string[];
  viewerId: string;
}): boolean {
  return v.canReview && (v.status === "open" || v.status === "rejected") && !recordedByViewer(v);
}

export function canReviewCorrection(v: {
  canReview: boolean;
  reviewStatus: string;
  proposedBy: string;
  viewerId: string;
}): boolean {
  return v.canReview && v.reviewStatus === "pending" && v.proposedBy !== v.viewerId;
}

export function parseDecision(v: unknown): Decision | null {
  return v === "approve" || v === "reject" ? v : null;
}

export type CleanReason = { ok: true; reason: string | null } | { ok: false; error: "attendance_reason_required" | "attendance_reason_long" };

// A rejection needs a reason of 1 to 500 characters; an approval may carry a note
// of the same length. The database repeats both rules.
export function cleanReason(decision: Decision, v: unknown): CleanReason {
  const reason = typeof v === "string" ? v.trim() : "";
  if (reason.length > MAX_REASON) return { ok: false, error: "attendance_reason_long" };
  if (reason.length === 0) {
    return decision === "reject" ? { ok: false, error: "attendance_reason_required" } : { ok: true, reason: null };
  }
  return { ok: true, reason };
}

export function reviewErrorCode(kind: "day" | "correction", sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "attendance_forbidden";
  if (sqlstate === "22023") return "attendance_reason_required";
  if (sqlstate === "55000") return kind === "day" ? "attendance_day_final" : "attendance_correction_stale";
  return "generic";
}

import type { MessageCode } from "../messages";

export const MAX_REVIEW_NOTE = 1000;
export const MAX_SEND_BACK_REASON = 1000;

// Decides only whether to draw the Mark reviewed and Send back buttons: both
// need a submitted report by someone else on a site the viewer reviews.
// review_daily_report and send_back_daily_report check the same things again
// and are the boundary: a wrong answer here shows a button the database refuses.
export function canMarkReviewed(v: {
  canReview: boolean;
  status: string;
  authorId: string;
  viewerId: string;
}): boolean {
  return v.canReview && v.status === "submitted" && v.authorId !== v.viewerId;
}

export function cleanReviewNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const note = v.trim();
  if (note.length === 0) return null;
  return note.length > MAX_REVIEW_NOTE ? "too_long" : note;
}

// A send-back always needs a reason (ADR-042 D2); the database checks it again.
export function cleanSendBackReason(v: unknown): string | "missing" | "too_long" {
  if (typeof v !== "string") return "missing";
  const reason = v.trim();
  if (reason.length === 0) return "missing";
  return reason.length > MAX_SEND_BACK_REASON ? "too_long" : reason;
}

export function sendBackErrorCode(sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "send_back_forbidden";
  if (sqlstate === "22023") return "send_back_reason";
  if (sqlstate === "55000") return "report_final";
  return "generic";
}

export function reviewErrorCode(sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "review_forbidden";
  if (sqlstate === "22023") return "review_note_long";
  return "generic";
}

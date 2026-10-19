import type { MessageCode } from "../messages";

export const MAX_REVIEW_NOTE = 1000;

// Decides only whether to draw the button. review_daily_report checks the same
// things again (can_review_site, not the author, not a draft) and is the
// boundary: a wrong answer here shows a button that the database then refuses.
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

export function reviewErrorCode(sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "review_forbidden";
  if (sqlstate === "22023") return "review_note_long";
  return "generic";
}

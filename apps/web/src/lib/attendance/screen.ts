import type { DayStatus, ReviewStatus } from "./rows";

// The status words the Attendance screens put in tags (docs/DESIGN.md section 4).
// They are the Overview's words, so both screens say the same thing; the tone
// follows the word (lib/app/status.ts): a day or correction waiting for a manager is
// red-deep, a settled one ink, a day with nothing recorded muted.

export function dayTag(status: DayStatus | null): string {
  if (status === null) return "Not started";
  if (status === "open") return "Needs approval";
  if (status === "rejected") return "Sent back";
  return "Approved";
}

export function correctionTag(status: ReviewStatus): string {
  if (status === "pending") return "Needs approval";
  if (status === "rejected") return "Rejected";
  return "Approved";
}

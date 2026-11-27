import type { StatusTone } from "@/lib/app/status";
import type { DayStatus, EntryStatus, ReviewStatus } from "./rows";

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

// The register marks the phone uses: P, ½ and A. Leave counts as absent in the totals.
export const ENTRY_MARK: Record<EntryStatus, { mark: string; tone: StatusTone }> = {
  present: { mark: "P", tone: "ink" },
  half_day: { mark: "½", tone: "action" },
  absent: { mark: "A", tone: "attention" },
  leave: { mark: "L", tone: "muted" }
};

export function headcount(entries: { status: EntryStatus }[]): { present: number; absent: number } {
  const present = entries.filter((e) => e.status === "present" || e.status === "half_day").length;
  return { present, absent: entries.length - present };
}

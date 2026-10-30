import type { StatusTone } from "@/lib/app/status";

// A daily report's status on the Reports screens (docs/DESIGN.md section 4). Here the
// question is "what does a manager still have to do", so a filed report that is not
// reviewed yet asks for action (red-deep), as does one sent back; a reviewed one is
// settled (ink). "rejected" is shown as "Sent back" (ADR-042 D1).
export function reportTag(status: string): { word: string; tone: StatusTone } {
  if (status === "reviewed") return { word: "Reviewed", tone: "ink" };
  if (status === "rejected") return { word: "Sent back", tone: "action" };
  return { word: "Waiting for a review", tone: "action" };
}

// Which tone a status tag takes in the app console (docs/DESIGN.md section 4). The
// word carries the meaning; the colour only repeats it.
//   action: amber, for a state that asks someone to act;
//   ink:    green, a settled state (approved, filed);
//   muted:  grey, nothing yet (draft, none, not started).

export type StatusTone = "action" | "ink" | "muted";

const ACTION = new Set([
  "needs approval",
  "needs attention",
  "waiting for a review",
  "sent back",
  "rejected",
  "flagged",
  "no rate",
  "low stock",
  "below zero"
]);

const MUTED = new Set(["draft", "none", "not started", "not filed", "no attendance", "no attendance recorded"]);

/** The tone for one of the app's own status words. Anything not listed is a settled, ink state. */
export function toneFor(status: string): StatusTone {
  const word = status.trim().toLowerCase();
  if (ACTION.has(word)) return "action";
  if (MUTED.has(word)) return "muted";
  return "ink";
}

// Which tone a status chip takes in the app console (docs/DESIGN.md section 5). The
// word and an icon carry the meaning; the colour only repeats it.
//   action:    amber, waiting for someone to act (the phone's "wait");
//   attention: red, something is wrong or blocked;
//   ink:       green, a settled state (approved, filed);
//   muted:     grey, nothing yet (draft, none, not started).

export type StatusTone = "action" | "attention" | "ink" | "muted";

const ACTION = new Set(["needs approval", "waiting for a review", "sent back"]);

const ATTENTION = new Set(["needs attention", "rejected", "flagged", "no rate", "low stock", "below zero"]);

const MUTED = new Set(["draft", "none", "not started", "not filed", "no attendance", "no attendance recorded"]);

/** The tone for one of the app's own status words. Anything not listed is a settled, ink state. */
export function toneFor(status: string): StatusTone {
  const word = status.trim().toLowerCase();
  if (ACTION.has(word)) return "action";
  if (ATTENTION.has(word)) return "attention";
  if (MUTED.has(word)) return "muted";
  return "ink";
}

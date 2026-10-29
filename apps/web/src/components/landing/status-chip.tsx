export type Tone = "ok" | "wait" | "warn" | "bad";

const TONE: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  wait: "bg-wait-soft text-wait",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad"
};

// A status always carries its word; the colour only repeats it (DESIGN.md).
export function StatusChip({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  );
}

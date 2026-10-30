import { toneFor, type StatusTone } from "@/lib/app/status";

// A status in the app's own words, mono in a 1 px box (docs/DESIGN.md section 4).
// The tone follows the word unless the caller gives one.
export function StatusTag({ children, tone }: { children: string; tone?: StatusTone }) {
  return <span className={`ax-tag ax-tag-${tone ?? toneFor(children)}`}>{children}</span>;
}

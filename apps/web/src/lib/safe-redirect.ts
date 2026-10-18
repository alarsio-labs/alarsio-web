// Where to send someone after sign-in. Only a path on this site is accepted, so
// a crafted ?next= cannot bounce a user to another origin.
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  for (const ch of next) {
    if (ch === "\\" || ch.charCodeAt(0) < 0x20) return fallback;
  }
  return next;
}

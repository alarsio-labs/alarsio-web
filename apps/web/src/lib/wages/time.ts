// The product shows times in Asia/Kolkata, whatever the server's zone is.
const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
});

/** "20 Oct 2026, 3:42 pm" for an ISO timestamp, or null when it is not one. */
export function formatIst(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : IST.format(new Date(t));
}

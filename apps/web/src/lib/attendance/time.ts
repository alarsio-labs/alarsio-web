// Attendance dates and times are Asia/Kolkata (ADR-021). The server's own time
// zone is not the viewer's, so every stamp says which zone it is in.
const ZONE = "Asia/Kolkata";

const DATE_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

// The calendar date in Kolkata, as YYYY-MM-DD.
export function istToday(now: Date): string {
  return DATE_PARTS.format(now);
}

export function istStamp(iso: string): string {
  return `${new Date(iso).toLocaleString("en-IN", { timeZone: ZONE, dateStyle: "medium", timeStyle: "short" })} IST`;
}

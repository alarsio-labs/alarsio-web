// Dates on screen. A date-only value (a rate's start) is a calendar day, so it
// is shown as written, never shifted by the server's time zone. A timestamp is
// shown in India time, the project's day rule (ADR-021).

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function formatDay(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { ...DAY, timeZone: "UTC" });
}

export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { ...DAY, timeZone: "Asia/Kolkata" });
}

/** Today's date in India, as YYYY-MM-DD. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

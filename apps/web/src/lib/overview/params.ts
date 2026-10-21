import { istToday } from "../attendance/time";

// Parses the /overview search params. The one value is the day to show; a bad
// one falls back to today in India time, so a crafted URL never reaches a query
// as anything but a real calendar date.
export type OverviewParams = { date: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  // Date.parse rolls 2026-02-30 over to March, so check the round trip.
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}

export function parseOverviewParams(
  params: Record<string, string | string[] | undefined>,
  now: Date
): OverviewParams {
  return { date: isCalendarDate(params.date) ? params.date : istToday(now) };
}

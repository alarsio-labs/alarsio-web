import { UUID } from "../uuid";
import { istToday } from "./time";

// Parses the /attendance search params. Every value is validated here and a bad
// one falls back to its default, so a crafted URL never reaches a query as
// anything but a uuid, one of five statuses, or a real calendar date.
export const DEFAULT_RANGE_DAYS = 31;
export const MAX_RANGE_DAYS = 31;

export const STATUS_FILTERS = ["needs_review", "open", "rejected", "approved", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type AttendanceFilters = {
  site: string | null;
  status: StatusFilter;
  from: string;
  to: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseDate(v: unknown): number | null {
  if (typeof v !== "string" || !DATE.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  // Date.parse rolls 2026-02-30 over to March, so check the round trip.
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== v ? null : ms;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function parseAttendanceFilters(
  params: Record<string, string | string[] | undefined>,
  now: Date
): AttendanceFilters {
  const site = typeof params.site === "string" && UUID.test(params.site) ? params.site : null;
  const status = STATUS_FILTERS.find((s) => s === params.status) ?? "needs_review";

  // Today is the Kolkata date; the arithmetic below is on calendar dates only.
  const todayMs = Date.parse(`${istToday(now)}T00:00:00Z`);
  const span = (DEFAULT_RANGE_DAYS - 1) * DAY_MS;

  const parsedTo = parseDate(params.to);
  const parsedFrom = parseDate(params.from);
  let to = parsedTo ?? todayMs;
  let from = parsedFrom ?? to - span;
  // No usable date, or a reversed range, means the default range.
  if ((parsedTo === null && parsedFrom === null) || from > to) {
    from = todayMs - span;
    to = todayMs;
  }
  if (to - from > (MAX_RANGE_DAYS - 1) * DAY_MS) from = to - (MAX_RANGE_DAYS - 1) * DAY_MS;

  return { site, status, from: iso(from), to: iso(to) };
}

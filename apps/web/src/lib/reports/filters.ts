// Parses the /reports search params. Every value is validated here and a bad
// one falls back to its default, so a crafted URL never reaches a query as
// anything but a uuid, one of three statuses, or a real calendar date.
export const DEFAULT_RANGE_DAYS = 7;
export const MAX_RANGE_DAYS = 31;

export type StatusFilter = "all" | "submitted" | "reviewed";

export type ReportFilters = {
  site: string | null;
  status: StatusFilter;
  flaggedOnly: boolean;
  from: string;
  to: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseDate(v: unknown): number | null {
  if (typeof v !== "string" || !DATE.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  // Date.parse rolls 2026-02-30 over to March, so check the round trip.
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== v ? null : ms;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function parseReportFilters(
  params: Record<string, string | string[] | undefined>,
  today: Date
): ReportFilters {
  const site = typeof params.site === "string" && UUID.test(params.site) ? params.site : null;
  const status: StatusFilter =
    params.status === "submitted" || params.status === "reviewed" ? params.status : "all";
  const flaggedOnly = params.flagged === "1";

  const todayMs = Date.parse(`${iso(today.getTime())}T00:00:00Z`);
  const defaultTo = todayMs;
  const defaultFrom = todayMs - (DEFAULT_RANGE_DAYS - 1) * DAY_MS;

  let to = parseDate(params.to) ?? defaultTo;
  let from = parseDate(params.from) ?? to - (DEFAULT_RANGE_DAYS - 1) * DAY_MS;
  // An unparseable `to` makes the whole range the default; a reversed one too.
  if (parseDate(params.to) === null && parseDate(params.from) === null) {
    from = defaultFrom;
    to = defaultTo;
  } else if (from > to) {
    from = defaultFrom;
    to = defaultTo;
  }
  if (to - from > (MAX_RANGE_DAYS - 1) * DAY_MS) from = to - (MAX_RANGE_DAYS - 1) * DAY_MS;

  return { site, status, flaggedOnly, from: iso(from), to: iso(to) };
}

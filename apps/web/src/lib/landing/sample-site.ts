// Sample data for the home page heatmap (docs/DESIGN.md v2.1, section 2). It is labelled
// "sample" on the page and is never a customer's figures. Deterministic: the same days and
// counts on the server and in the browser, so the page hydrates without a mismatch.

export type SampleDay = {
  /** ISO date, yyyy-mm-dd. */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** False on Sundays and the two site holidays: nobody is expected. */
  worked: boolean;
  present: number;
  reportFiled: boolean;
  approved: boolean;
};

export const SAMPLE_ROSTER = 42;
export const SAMPLE_WEEKS = 26;
// The last day shown. Fixed, so the page is the same whenever it is built.
const LAST_DAY = Date.UTC(2026, 9, 31);
const HOLIDAYS = new Set(["2026-08-15", "2026-10-02"]);
const DAY_MS = 86_400_000;

/** A small seeded generator (mulberry32), so the sample never changes between renders. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SAMPLE_WEEKS full weeks, Sunday to Saturday, ending on the week that holds LAST_DAY. */
export function sampleSeason(): SampleDay[] {
  const rand = seeded(20261031);
  const lastWeekday = new Date(LAST_DAY).getUTCDay();
  const end = LAST_DAY + (6 - lastWeekday) * DAY_MS;
  const start = end - (SAMPLE_WEEKS * 7 - 1) * DAY_MS;
  const days: SampleDay[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const d = new Date(t);
    const date = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay();
    const future = t > LAST_DAY;
    const worked = !future && weekday !== 0 && !HOLIDAYS.has(date);
    const r = rand();
    // Most days 34–42 present; about one day in twelve is short (rain, a festival week).
    const present = worked ? (r < 0.08 ? 18 + Math.floor(rand() * 12) : 34 + Math.floor(rand() * 9)) : 0;
    const reportFiled = worked && rand() > 0.06;
    days.push({ date, weekday, worked, present: Math.min(present, SAMPLE_ROSTER), reportFiled, approved: reportFiled && rand() > 0.04 });
  }
  return days;
}

/** 0 = not a working day; 1–4 = share of the roster present (under 78 %, 78 %, 88 %, 95 %+). */
export function levelOf(day: SampleDay, roster = SAMPLE_ROSTER): 0 | 1 | 2 | 3 | 4 {
  if (!day.worked) return 0;
  const share = day.present / roster;
  if (share >= 0.95) return 4;
  if (share >= 0.88) return 3;
  if (share >= 0.78) return 2;
  return 1;
}

export type SeasonStats = { busiest: SampleDay | null; averagePresent: number; longestReportRun: number; workedDays: number };

export function seasonStats(days: SampleDay[]): SeasonStats {
  const worked = days.filter((d) => d.worked);
  let busiest: SampleDay | null = null;
  for (const d of worked) if (!busiest || d.present > busiest.present) busiest = d;
  const averagePresent = worked.length ? Math.round(worked.reduce((s, d) => s + d.present, 0) / worked.length) : 0;
  // A run counts working days in a row with a report; Sundays and holidays do not break it.
  let run = 0;
  let longestReportRun = 0;
  for (const d of worked) {
    run = d.reportFiled ? run + 1 : 0;
    longestReportRun = Math.max(longestReportRun, run);
  }
  return { busiest, averagePresent, longestReportRun, workedDays: worked.length };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 14 Aug". */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The line shown when a day is tapped. */
export function describeDay(day: SampleDay, roster = SAMPLE_ROSTER): string {
  const when = shortDate(day.date);
  if (!day.worked) return `${when} · no work planned`;
  const report = day.reportFiled ? "report filed" : "no report";
  const approval = day.approved ? "approved" : "not approved";
  return `${when} · ${day.present} of ${roster} present · ${report} · ${approval}`;
}

/** Month labels for the columns: the label sits on the first week that starts in that month. */
export function monthLabels(days: SampleDay[]): { week: number; label: string }[] {
  const out: { week: number; label: string }[] = [];
  let last = -1;
  for (let w = 0; w * 7 < days.length; w++) {
    const first = days[w * 7];
    if (!first) break;
    const m = Number(first.date.slice(5, 7)) - 1;
    if (m !== last) out.push({ week: w, label: MONTHS[m] ?? "" });
    last = m;
  }
  return out;
}

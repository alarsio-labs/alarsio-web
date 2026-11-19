// One worker's month as the phone shows it: the dates, the summary and which dates may
// be marked. Owner: Attendance (Manish). Issue #234. Pure: no database, no clock.

import type { EntryStatus } from './register';

export interface DayMark {
  status: EntryStatus;
  overtimeHours: number;
}

export interface MonthSummary {
  present: number;
  halfDays: number;
  leave: number;
  absent: number;
  /** Dates with no entry. Never counted as absent: nobody has said the worker was away. */
  notMarked: number;
  /** present 1, half_day 0.5, leave and absent 0: the rule of wage_compute_days. */
  payableDays: number;
  overtimeHours: number;
}

/** Every day of a month, as YYYY-MM-DD. `month` is YYYY-MM. */
export function monthDates(month: string): string[] {
  const [year, mon] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** The month `by` months from `month` (YYYY-MM). */
export function shiftMonth(month: string, by: number): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon - 1 + by, 1)).toISOString().slice(0, 7);
}

export function summariseMonth(dates: string[], marks: Map<string, DayMark>): MonthSummary {
  const s: MonthSummary = { present: 0, halfDays: 0, leave: 0, absent: 0, notMarked: 0, payableDays: 0, overtimeHours: 0 };
  let overtimeHundredths = 0;
  for (const date of dates) {
    const mark = marks.get(date);
    if (!mark) {
      s.notMarked += 1;
      continue;
    }
    if (mark.status === 'present') {
      s.present += 1;
      s.payableDays += 1;
    } else if (mark.status === 'half_day') {
      s.halfDays += 1;
      s.payableDays += 0.5;
    } else if (mark.status === 'leave') {
      s.leave += 1;
    } else {
      s.absent += 1;
    }
    overtimeHundredths += Math.round(mark.overtimeHours * 100);
  }
  s.overtimeHours = overtimeHundredths / 100;
  return s;
}

export type NotMarkable = 'future' | 'not_assigned';

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Why a date cannot be marked, or null. The server takes nothing after tomorrow, and
 * saveMark refuses a worker who was not rostered that day (both ends of an assignment
 * count, ADR-021 D10). Dates are Asia/Kolkata days; `today` is the caller's.
 */
export function whyNotMarkable(
  date: string,
  today: string,
  assignment: { assignedOn: string; unassignedOn: string | null },
): NotMarkable | null {
  if (date > addDays(today, 1)) return 'future';
  if (date < assignment.assignedOn) return 'not_assigned';
  if (assignment.unassignedOn !== null && date > assignment.unassignedOn) return 'not_assigned';
  return null;
}

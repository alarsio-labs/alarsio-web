// The words for a status, a day and a month, shared by the attendance screens.
// Owner: Attendance (Manish). The words are in src/i18n (en.json, hi.json).

import i18n from '../i18n';
import type { EntryStatus } from './register';

const t = i18n.t.bind(i18n);

const STATUS_KEYS = {
  present: 'fields.present',
  absent: 'fields.absent',
  half_day: 'fields.halfDay',
  leave: 'fields.leave',
} as const satisfies Record<EntryStatus, string>;

export const statusLabel = (status: EntryStatus): string => t(STATUS_KEYS[status]);

export const overtimeText = (hours: number): string => t('fields.overtimeText', { hours });

/** "Present", then "2.5 h overtime" when there is overtime. */
export const markParts = (mark: { status: EntryStatus; overtimeHours: number }): string[] => [
  statusLabel(mark.status),
  ...(mark.overtimeHours > 0 ? [overtimeText(mark.overtimeHours)] : []),
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

const monthOf = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1] ?? 'jan';

/** "2026-10-19" as "19 Oct". */
export const dayLabel = (day: string): string => `${Number(day.slice(8, 10))} ${t(`attendance.monthShort.${monthOf(day)}`)}`;

/** "2026-10" as "October 2026". */
export const monthLabel = (month: string): string =>
  t('workerMonth.monthYear', { month: t(`workerMonth.monthLong.${monthOf(month)}`), year: month.slice(0, 4) });

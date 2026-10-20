// A daily report as the phone builds it, checks it and sends it. Owner: Daily
// Reporting (Anuradha). Issue #81, ADR-036. The database is the boundary
// (ADR-013): these checks repeat its limits only so the supervisor hears what is
// wrong before anything is saved. The payload is exactly what sync_daily_reports
// reads (ADR-022 H2), one JSON type per field.

import type { OutboxStatus } from '../sync/entities';
import { reasonText } from '../sync/status-text';

/** ADR-013 R4, and the table's CHECKs. Text is counted as char_length counts it. */
export const REPORT_LIMITS = {
  headcount: 1000,
  workDone: 4000,
  blockers: 2000,
  nextDayPlan: 2000,
  reason: 500,
} as const;

export type ReportStatus = 'draft' | 'submitted';

/** What the form holds: text as typed, flags as switched. */
export interface ReportFields {
  headcount: string;
  workDone: string;
  blockers: string;
  seriousBlocker: boolean;
  safetyIncident: boolean;
  nextDayPlan: string;
}

export interface Report {
  orgId: string;
  siteId: string;
  /** The IST day, YYYY-MM-DD. */
  reportDate: string;
  status: ReportStatus;
  headcount: number | null;
  workDone: string | null;
  blockers: string | null;
  seriousBlocker: boolean;
  safetyIncident: boolean;
  nextDayPlan: string | null;
  /** Write-only on the server: used for the revision, never stored (ADR-013 R6). */
  editReason: string | null;
}

export interface ReportSite {
  id: string;
  /** Null on a phone whose mirror predates device migration 5 (#79). */
  orgId: string | null;
}

export type ReportErrorCode =
  | 'headcount_invalid'
  | 'headcount_required'
  | 'work_done_required'
  | 'work_done_too_long'
  | 'blockers_too_long'
  | 'plan_too_long'
  | 'blocker_text_required'
  | 'reason_required'
  | 'reason_too_long'
  | 'already_submitted'
  | 'no_changes'
  | 'different_report'
  | 'no_org'
  | 'bad_date'
  | 'reviewed'
  | 'not_found';

export class ReportError extends Error {
  constructor(readonly code: ReportErrorCode) {
    super(code);
    this.name = 'ReportError';
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WHOLE = /^\d{1,4}$/;

/** Characters as Postgres char_length counts them (code points), not UTF-16 units. */
export function charCount(text: string): number {
  return [...text].length;
}

function isCalendarDay(text: string): boolean {
  if (!DAY.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

function kept(text: string, limit: number, tooLong: ReportErrorCode): string | null {
  const t = text.trim();
  if (t === '') return null;
  if (charCount(t) > limit) throw new ReportError(tooLong);
  return t;
}

function headcountOf(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (!WHOLE.test(t)) throw new ReportError('headcount_invalid');
  const n = Number(t);
  if (n > REPORT_LIMITS.headcount) throw new ReportError('headcount_invalid');
  return n;
}

/**
 * Once a report was submitted on this phone, every change needs a reason: the
 * phone cannot tell whether the server already holds the submitted version, and
 * an insert ignores edit_reason (D4).
 */
export function needsReason(previous: Report | null): boolean {
  return previous?.status === 'submitted';
}

function sameContent(a: Report, b: Report): boolean {
  return (
    a.status === b.status &&
    a.headcount === b.headcount &&
    a.workDone === b.workDone &&
    a.blockers === b.blockers &&
    a.seriousBlocker === b.seriousBlocker &&
    a.safetyIncident === b.safetyIncident &&
    a.nextDayPlan === b.nextDayPlan
  );
}

/**
 * Builds the report to save from the form, refusing what the database would
 * refuse. `previous` is this user's saved version of the same report, if any.
 */
export function buildReport(
  site: ReportSite,
  reportDate: string,
  fields: ReportFields,
  status: ReportStatus,
  { previous, reason }: { previous: Report | null; reason?: string },
): Report {
  if (site.orgId === null) throw new ReportError('no_org');
  if (!isCalendarDay(reportDate)) throw new ReportError('bad_date');
  if (previous && (previous.siteId !== site.id || previous.reportDate !== reportDate)) {
    throw new ReportError('different_report');
  }
  if (previous?.status === 'submitted' && status === 'draft') throw new ReportError('already_submitted');

  const headcount = headcountOf(fields.headcount);
  const workDone = kept(fields.workDone, REPORT_LIMITS.workDone, 'work_done_too_long');
  const blockers = kept(fields.blockers, REPORT_LIMITS.blockers, 'blockers_too_long');
  const nextDayPlan = kept(fields.nextDayPlan, REPORT_LIMITS.nextDayPlan, 'plan_too_long');

  // daily_reports_serious_blocker_explained has no status condition: drafts too.
  if (fields.seriousBlocker && blockers === null) throw new ReportError('blocker_text_required');
  if (status === 'submitted') {
    if (headcount === null) throw new ReportError('headcount_required');
    if (workDone === null) throw new ReportError('work_done_required');
  }

  const report: Report = {
    orgId: site.orgId.toLowerCase(),
    siteId: site.id.toLowerCase(),
    reportDate,
    status,
    headcount,
    workDone,
    blockers,
    seriousBlocker: fields.seriousBlocker,
    safetyIncident: fields.safetyIncident,
    nextDayPlan,
    editReason: null,
  };

  if (needsReason(previous)) {
    if (previous && sameContent(previous, report)) throw new ReportError('no_changes');
    const why = (reason ?? '').trim();
    if (why === '') throw new ReportError('reason_required');
    if (charCount(why) > REPORT_LIMITS.reason) throw new ReportError('reason_too_long');
    report.editReason = why;
  }
  return report;
}

/** The payload sync_daily_reports reads. Every key is always there, null where empty. */
export function buildPayload(r: Report): Record<string, unknown> {
  return {
    org_id: r.orgId,
    site_id: r.siteId,
    report_date: r.reportDate,
    status: r.status,
    headcount: r.headcount,
    work_done: r.workDone,
    blockers: r.blockers,
    serious_blocker: r.seriousBlocker,
    safety_incident: r.safetyIncident,
    next_day_plan: r.nextDayPlan,
    edit_reason: r.editReason,
  };
}

const isText = (v: unknown): v is string => typeof v === 'string';
const isTextOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** A saved payload read back, or null if it is not a report this phone wrote. */
export function parsePayload(p: unknown): Report | null {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const v = p as Record<string, unknown>;
  if (
    !isText(v.org_id) ||
    !isText(v.site_id) ||
    !isText(v.report_date) ||
    !isCalendarDay(v.report_date) ||
    (v.status !== 'draft' && v.status !== 'submitted') ||
    !(v.headcount === null || (typeof v.headcount === 'number' && Number.isInteger(v.headcount))) ||
    !isTextOrNull(v.work_done) ||
    !isTextOrNull(v.blockers) ||
    typeof v.serious_blocker !== 'boolean' ||
    typeof v.safety_incident !== 'boolean' ||
    !isTextOrNull(v.next_day_plan) ||
    !isTextOrNull(v.edit_reason)
  ) {
    return null;
  }
  return {
    orgId: v.org_id,
    siteId: v.site_id,
    reportDate: v.report_date,
    status: v.status,
    headcount: v.headcount,
    workDone: v.work_done,
    blockers: v.blockers,
    seriousBlocker: v.serious_blocker,
    safetyIncident: v.safety_incident,
    nextDayPlan: v.next_day_plan,
    editReason: v.edit_reason,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-19" as "19 Oct". */
export function dayLabel(day: string): string {
  const month = MONTHS[Number(day.slice(5, 7)) - 1] ?? '';
  return `${Number(day.slice(8, 10))} ${month}`;
}

/** The day to report on: the one asked for if it is a real day up to today, else today (D2). */
export function reportDay(asked: string | undefined, today: string): string {
  return asked !== undefined && isCalendarDay(asked) && asked <= today ? asked : today;
}

/** The form's text for a saved report, or an empty form. */
export function fieldsOf(r: Report | null): ReportFields {
  return {
    headcount: r?.headcount === null || r === null ? '' : String(r.headcount),
    workDone: r?.workDone ?? '',
    blockers: r?.blockers ?? '',
    seriousBlocker: r?.seriousBlocker ?? false,
    safetyIncident: r?.safetyIncident ?? false,
    nextDayPlan: r?.nextDayPlan ?? '',
  };
}

/** The day's attendance on this phone, as Attendance's readHeadcount answers it (#109). */
export interface DayAttendance {
  onSite: number;
  halfDay: number;
}

/**
 * The form a report opens with. A saved report keeps its own values; a new one
 * starts with the headcount from the day's attendance when the phone holds any,
 * and empty otherwise, to be typed (ADR-038 D4).
 */
export function openingFields(saved: Report | null, attendance: DayAttendance | null): ReportFields {
  const fields = fieldsOf(saved);
  if (saved === null && attendance !== null) fields.headcount = String(attendance.onSite);
  return fields;
}

/** Where the pre-filled number came from, said under the field (ADR-038 D5). */
export function headcountHint(a: DayAttendance): string {
  const half = a.halfDay > 0 ? ` (${a.halfDay} half day)` : '';
  return `From attendance on this phone: ${a.onSite} on site${half}`;
}

/** A serious blocker or a safety incident flags the report to managers (ADR-013 R3). */
export function isFlagged(f: Pick<ReportFields, 'seriousBlocker' | 'safetyIncident'>): boolean {
  return f.seriousBlocker || f.safetyIncident;
}

export type ReportTone = 'wait' | 'ok' | 'attention';

// The handler's codes (ADR-022 H5) and sync_push's mapping, said for a report.
const REPORT_REASONS: Record<string, string> = {
  reviewed: 'A manager already reviewed this report, so it was not changed.',
  duplicate: 'Another report for this site and day is already on the server. Ask your manager.',
  different_report: 'The server holds a different report under this record. Ask your manager.',
  invalid_input: "Something in this report isn't valid. Check it and send again.",
  invalid_state: 'A submitted report cannot go back to a draft.',
  permission_denied: "You can't report on this site any more.",
};

/**
 * Where a report stands, in plain words. "Submitted" only for a submitted report
 * the server has accepted (ADR-009): nothing else on this phone may say it.
 */
export function reportStatusText(
  status: ReportStatus,
  outbox: OutboxStatus,
  reason: string | null,
): { tone: ReportTone; text: string } {
  switch (outbox) {
    case 'pending':
    case 'syncing':
      return { tone: 'wait', text: 'Saved on this phone, waiting to send' };
    case 'failed':
      return { tone: 'wait', text: 'Saved on this phone. Could not send yet, will retry.' };
    case 'synced':
      return status === 'submitted'
        ? { tone: 'ok', text: 'Submitted' }
        : { tone: 'ok', text: 'Draft on the server, only you can see it' };
    case 'conflict':
    case 'rejected':
      return {
        tone: 'attention',
        text: `Needs attention · ${(reason !== null ? REPORT_REASONS[reason] : undefined) ?? reasonText(reason)}`,
      };
  }
}

/** One fixed sentence per failure, never the error's own text (it can name files, ADR-029). */
export function reportErrorText(error: unknown): string {
  if (error instanceof ReportError) {
    switch (error.code) {
      case 'headcount_invalid':
        return `Enter the headcount as a whole number from 0 to ${REPORT_LIMITS.headcount}.`;
      case 'headcount_required':
        return 'Enter the headcount to submit.';
      case 'work_done_required':
        return 'Say what work was done to submit.';
      case 'work_done_too_long':
        return `Keep the work done to ${REPORT_LIMITS.workDone} characters or fewer.`;
      case 'blockers_too_long':
        return `Keep the blockers to ${REPORT_LIMITS.blockers} characters or fewer.`;
      case 'plan_too_long':
        return `Keep the next-day plan to ${REPORT_LIMITS.nextDayPlan} characters or fewer.`;
      case 'blocker_text_required':
        return 'Describe the serious blocker.';
      case 'reason_required':
        return 'Say why you are changing a submitted report.';
      case 'reason_too_long':
        return `Keep the reason to ${REPORT_LIMITS.reason} characters or fewer.`;
      case 'already_submitted':
        return 'This report is submitted. Change it and give a reason instead.';
      case 'no_changes':
        return 'Nothing has changed, so there is nothing to send.';
      case 'different_report':
        return 'This report belongs to another site or day.';
      case 'no_org':
        return 'Connect once to refresh your sites, then try again.';
      case 'bad_date':
        return 'That day is not valid.';
      case 'reviewed':
        return 'A manager already reviewed this report. It cannot be changed.';
      case 'not_found':
        return 'This report cannot be changed on this phone.';
    }
  }
  return 'Could not save on this phone. Try again.';
}

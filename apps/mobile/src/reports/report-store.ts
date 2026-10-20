// Saves and reads a user's daily reports through the outbox. Owner: Daily
// Reporting (Anuradha). Issue #81, ADR-036. The outbox is the only place a report
// lives on the phone (D1): a draft and a submit are both saves of one record per
// author, site and day, and the screen reads it back from there. Nothing is sent
// from here; the sync engine does that.

import type { DeviceDb } from '../db/device-db';
import type { OutboxStatus } from '../sync/entities';
import { enqueue, listRecords, newRecordId } from '../sync/outbox';
import {
  buildPayload,
  buildReport,
  parsePayload,
  ReportError,
  type Report,
  type ReportFields,
  type ReportSite,
  type ReportStatus,
} from './report';

export interface StoredReport {
  recordId: string;
  report: Report;
  status: OutboxStatus;
  reason: string | null;
}

// listRecords reads newest first and stops at a limit. One report per site and day
// means 400 rows is more than a year of one site, so the day asked for is found.
const SITE_LIMIT = 400;
const UNFINISHED_SCAN = 400;
const UNFINISHED_SHOWN = 10;

async function readReports(db: DeviceDb, userId: string, siteId?: string): Promise<StoredReport[]> {
  // Without a user there is nothing: never another user's reports (ADR-020).
  if (!userId) return [];
  const records = await listRecords(db, userId, 'daily_reports', {
    siteId: siteId?.toLowerCase(),
    limit: siteId ? SITE_LIMIT : UNFINISHED_SCAN,
  });
  const reports: StoredReport[] = [];
  for (const r of records) {
    const report = parsePayload(r.payload);
    if (report) reports.push({ recordId: r.recordId, report, status: r.status, reason: r.reason });
  }
  return reports;
}

/** This user's report for one site and day, if the phone holds one. */
export async function findReport(
  db: DeviceDb,
  userId: string,
  siteId: string,
  reportDate: string,
): Promise<StoredReport | null> {
  const reports = await readReports(db, userId, siteId);
  return reports.find((r) => r.report.reportDate === reportDate) ?? null;
}

/** This user's reports for one site, newest saved first. */
export async function listSiteReports(db: DeviceDb, userId: string, siteId: string): Promise<StoredReport[]> {
  return readReports(db, userId, siteId);
}

/** A manager reviewed it: final, so there is nothing left for the supervisor to do (ADR-013 R5). */
function isReviewed(r: StoredReport): boolean {
  return r.status === 'conflict' && r.reason === 'reviewed';
}

/**
 * This user's reports from before `today` that still need them: drafts never
 * submitted, and reports the server refused or kept its own version of, except
 * a reviewed one. Newest day first, at most ten (D2).
 */
export async function listUnfinished(db: DeviceDb, userId: string, today: string): Promise<StoredReport[]> {
  const reports = await readReports(db, userId);
  return reports
    .filter(
      (r) =>
        r.report.reportDate < today &&
        !isReviewed(r) &&
        (r.report.status === 'draft' || r.status === 'conflict' || r.status === 'rejected'),
    )
    .sort((a, b) => (a.report.reportDate < b.report.reportDate ? 1 : a.report.reportDate > b.report.reportDate ? -1 : 0))
    .slice(0, UNFINISHED_SHOWN);
}

/**
 * Saves a draft or a submit of this user's report for the site and day, under the
 * record id the phone already holds for it, or a new one. Anything the rules
 * refuse throws a ReportError and writes nothing. Returns the record id.
 */
export async function saveReport(
  db: DeviceDb,
  userId: string,
  site: ReportSite,
  reportDate: string,
  fields: ReportFields,
  status: ReportStatus,
  { reason }: { reason?: string },
  now: Date = new Date(),
): Promise<string> {
  if (!userId) throw new ReportError('not_found');
  const existing = await findReport(db, userId, site.id, reportDate);
  // A reviewed report is final (ADR-013 R5): resending would only be refused again.
  if (existing && isReviewed(existing)) throw new ReportError('reviewed');

  const report = buildReport(site, reportDate, fields, status, { previous: existing?.report ?? null, reason });
  const recordId = existing?.recordId ?? newRecordId();
  await enqueue(db, { entity: 'daily_reports', recordId, authorId: userId, payload: buildPayload(report) }, now);
  return recordId;
}

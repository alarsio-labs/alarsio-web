// Narrowing for rows that come back from PostgREST as unknown JSON. The
// database is the boundary; these only make the page's types honest.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// What daily_report_status shows: never a draft. "rejected" is shown as "Sent back" (ADR-042).
export const REPORT_STATUSES = ["submitted", "rejected", "reviewed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type ReportStatusRow = {
  id: string;
  site_id: string;
  report_date: string;
  author_id: string;
  status: ReportStatus;
  headcount: number | null;
  serious_blocker: boolean;
  safety_incident: boolean;
  flagged: boolean;
  photo_count: number;
};

export type SiteRow = { id: string; name: string; status: string };

export type ReportRow = {
  id: string;
  site_id: string;
  report_date: string;
  author_id: string;
  status: string;
  headcount: number | null;
  work_done: string | null;
  blockers: string | null;
  serious_blocker: boolean;
  safety_incident: boolean;
  next_day_plan: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export type RevisionRow = {
  id: string;
  revision_no: number;
  headcount: number | null;
  work_done: string | null;
  blockers: string | null;
  serious_blocker: boolean;
  safety_incident: boolean;
  next_day_plan: string | null;
  reason: string;
  edited_at: string;
  // Set when this edit resubmitted a sent-back report: the send-back it answers.
  sent_back_reason: string | null;
  sent_back_at: string | null;
};

export type PhotoRow = { id: string; storage_path: string; caption: string | null };

type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const numOrNull = (v: unknown): v is number | null => v === null || typeof v === "number";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

export function isReportStatusRow(v: unknown): v is ReportStatusRow {
  return (
    rec(v) && str(v.id) && str(v.site_id) && str(v.report_date) && str(v.author_id) &&
    REPORT_STATUSES.some((s) => s === v.status) && numOrNull(v.headcount) &&
    typeof v.serious_blocker === "boolean" && typeof v.safety_incident === "boolean" &&
    typeof v.flagged === "boolean" && typeof v.photo_count === "number"
  );
}

export const isSiteRow = (v: unknown): v is SiteRow =>
  rec(v) && str(v.id) && str(v.name) && str(v.status);

export function isReportRow(v: unknown): v is ReportRow {
  return (
    rec(v) && str(v.id) && str(v.site_id) && str(v.report_date) && str(v.author_id) && str(v.status) &&
    numOrNull(v.headcount) && strOrNull(v.work_done) && strOrNull(v.blockers) &&
    typeof v.serious_blocker === "boolean" && typeof v.safety_incident === "boolean" &&
    strOrNull(v.next_day_plan) && strOrNull(v.submitted_at) && strOrNull(v.reviewed_at) && strOrNull(v.review_note)
  );
}

export function isRevisionRow(v: unknown): v is RevisionRow {
  return (
    rec(v) && str(v.id) && typeof v.revision_no === "number" && numOrNull(v.headcount) &&
    strOrNull(v.work_done) && strOrNull(v.blockers) && typeof v.serious_blocker === "boolean" &&
    typeof v.safety_incident === "boolean" && strOrNull(v.next_day_plan) && str(v.reason) && str(v.edited_at) &&
    strOrNull(v.sent_back_reason) && strOrNull(v.sent_back_at)
  );
}

export const isPhotoRow = (v: unknown): v is PhotoRow =>
  rec(v) && str(v.id) && str(v.storage_path) && strOrNull(v.caption);

export const rows = <T>(data: unknown, guard: (v: unknown) => v is T): T[] =>
  Array.isArray(data) ? data.filter(guard) : [];

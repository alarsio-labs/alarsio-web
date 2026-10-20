// Narrowing for rows that come back from PostgREST as unknown JSON. The
// database is the boundary; these only make the page's types honest.
export const DAY_STATUSES = ["open", "approved", "rejected"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

export const ENTRY_STATUSES = ["present", "absent", "half_day", "leave"] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const EXCEPTION_KINDS = [
  "geofence_check_in",
  "geofence_check_out",
  "visit_not_closed",
  "day_awaiting_review",
  "day_rejected",
  "correction_pending"
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// numeric(4,2) arrives as a number or as a string, depending on the driver.
export type Hours = number | string;

export type DayRow = {
  id: string;
  site_id: string;
  attendance_date: string;
  status: DayStatus;
  recorded_by: string;
  reviewed_at: string | null;
  review_reason: string | null;
};

export type ExceptionRow = {
  site_id: string;
  exception_date: string;
  kind: ExceptionKind;
  source_id: string;
  worker_id: string | null;
  reason: string | null;
  distance_m: number | string | null;
  changed_since_review: boolean | null;
};

export type EntryRow = {
  id: string;
  worker_id: string;
  status: EntryStatus;
  overtime_hours: Hours;
  note: string | null;
  recorded_by: string;
};

export type CorrectionRow = {
  id: string;
  worker_id: string;
  old_status: EntryStatus;
  old_overtime_hours: Hours;
  old_note: string | null;
  new_status: EntryStatus;
  new_overtime_hours: Hours;
  new_note: string | null;
  reason: string;
  proposed_by: string;
  created_at: string;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  review_reason: string | null;
};

export type WorkerRow = { worker_id: string; name: string };

type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.some((x) => x === v);
const hours = (v: unknown): v is Hours =>
  typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));

export const isDayRow = (v: unknown): v is DayRow =>
  rec(v) && str(v.id) && str(v.site_id) && str(v.attendance_date) && oneOf(DAY_STATUSES, v.status) &&
  str(v.recorded_by) && strOrNull(v.reviewed_at) && strOrNull(v.review_reason);

export const isExceptionRow = (v: unknown): v is ExceptionRow =>
  rec(v) && str(v.site_id) && str(v.exception_date) && oneOf(EXCEPTION_KINDS, v.kind) && str(v.source_id) &&
  strOrNull(v.worker_id) && strOrNull(v.reason) && (v.distance_m === null || hours(v.distance_m)) &&
  (v.changed_since_review === null || typeof v.changed_since_review === "boolean");

export const isEntryRow = (v: unknown): v is EntryRow =>
  rec(v) && str(v.id) && str(v.worker_id) && oneOf(ENTRY_STATUSES, v.status) && hours(v.overtime_hours) &&
  strOrNull(v.note) && str(v.recorded_by);

export const isCorrectionRow = (v: unknown): v is CorrectionRow =>
  rec(v) && str(v.id) && str(v.worker_id) && oneOf(ENTRY_STATUSES, v.old_status) && hours(v.old_overtime_hours) &&
  strOrNull(v.old_note) && oneOf(ENTRY_STATUSES, v.new_status) && hours(v.new_overtime_hours) &&
  strOrNull(v.new_note) && str(v.reason) && str(v.proposed_by) && str(v.created_at) &&
  oneOf(REVIEW_STATUSES, v.review_status) && strOrNull(v.reviewed_at) && strOrNull(v.review_reason);

export const isWorkerRow = (v: unknown): v is WorkerRow => rec(v) && str(v.worker_id) && str(v.name);

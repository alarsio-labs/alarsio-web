import { EXCEPTION_KINDS, type ExceptionKind } from "../attendance/rows";

// Narrowing for the rows /overview reads from four published views. The
// database is the boundary; these only make the page's types honest, and each
// one names only the columns the page selects.
export type OverviewReportRow = {
  id: string;
  site_id: string;
  status: "submitted" | "reviewed";
  headcount: number | null;
  serious_blocker: boolean;
  safety_incident: boolean;
  flagged: boolean;
};

export type OverviewExceptionRow = { site_id: string; kind: ExceptionKind };

// approved_attendance_days has one row per entry; only the site matters here.
export type ApprovedDayRow = { site_id: string };

export type AlertRow = { site_id: string; material_id: string; alert: "low" | "negative" };

type Rec = Record<string, unknown>;
const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): v is string => typeof v === "string";
const bool = (v: unknown): v is boolean => typeof v === "boolean";

export const isOverviewReportRow = (v: unknown): v is OverviewReportRow =>
  rec(v) && str(v.id) && str(v.site_id) && (v.status === "submitted" || v.status === "reviewed") &&
  (v.headcount === null || typeof v.headcount === "number") &&
  bool(v.serious_blocker) && bool(v.safety_incident) && bool(v.flagged);

export const isOverviewExceptionRow = (v: unknown): v is OverviewExceptionRow =>
  rec(v) && str(v.site_id) && EXCEPTION_KINDS.some((k) => k === v.kind);

export const isApprovedDayRow = (v: unknown): v is ApprovedDayRow => rec(v) && str(v.site_id);

export const isAlertRow = (v: unknown): v is AlertRow =>
  rec(v) && str(v.site_id) && str(v.material_id) && (v.alert === "low" || v.alert === "negative");

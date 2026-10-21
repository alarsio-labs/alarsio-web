import type { ReportStatus, SiteRow } from "../reports/rows";
import type { AlertRow, ApprovedDayRow, OverviewExceptionRow, OverviewReportRow } from "./rows";

// One row per site for one day, built only from published views (ADR-041).
// Every input is already filtered to the organisation and the date by the
// page, and to what the caller may see by RLS; a row for a site missing from
// the directory is dropped, so nothing shows without its site's name.
export type AttendanceState = "approved" | "awaiting_review" | "sent_back" | "not_recorded";

export type BoardReport = {
  id: string;
  // "rejected" is a report a manager sent back (ADR-042): filed, waiting on its author.
  status: ReportStatus;
  headcount: number | null;
  seriousBlocker: boolean;
  safetyIncident: boolean;
  flagged: boolean;
};

export type BoardRow = {
  siteId: string;
  siteName: string;
  siteStatus: string;
  report: BoardReport | null;
  attendance: AttendanceState;
  geofenceFlags: number;
  visitsNotClosed: number;
  pendingCorrections: number;
  lowStock: number;
};

export type BoardInput = {
  sites: readonly SiteRow[];
  reports: readonly OverviewReportRow[];
  exceptions: readonly OverviewExceptionRow[];
  approvedDays: readonly ApprovedDayRow[];
  alerts: readonly AlertRow[];
};

export function buildBoard(input: BoardInput): BoardRow[] {
  const reportBySite = new Map(input.reports.map((r) => [r.site_id, r]));
  const approvedSites = new Set(input.approvedDays.map((d) => d.site_id));
  const exceptionsBySite = new Map<string, OverviewExceptionRow[]>();
  for (const x of input.exceptions) exceptionsBySite.set(x.site_id, [...(exceptionsBySite.get(x.site_id) ?? []), x]);
  const lowStockBySite = new Map<string, Set<string>>();
  for (const a of input.alerts) lowStockBySite.set(a.site_id, (lowStockBySite.get(a.site_id) ?? new Set()).add(a.material_id));

  const out: BoardRow[] = [];
  for (const site of input.sites) {
    const r = reportBySite.get(site.id);
    const xs = exceptionsBySite.get(site.id) ?? [];
    const count = (kinds: readonly OverviewExceptionRow["kind"][]) => xs.filter((x) => kinds.includes(x.kind)).length;

    // One attendance day per site and date (ADR-021), so at most one of these holds.
    // An approved day with no entries leaves no row in approved_attendance_days and
    // reads as not recorded: the known gap in ADR-041 D3.
    const attendance: AttendanceState = count(["day_rejected"]) > 0
      ? "sent_back"
      : count(["day_awaiting_review"]) > 0
        ? "awaiting_review"
        : approvedSites.has(site.id)
          ? "approved"
          : "not_recorded";

    // A site that is not active is listed only when something happened on it that day.
    const activeThatDay = r !== undefined || attendance !== "not_recorded" || xs.length > 0;
    if (site.status !== "active" && !activeThatDay) continue;

    out.push({
      siteId: site.id,
      siteName: site.name,
      siteStatus: site.status,
      report: r
        ? {
            id: r.id,
            status: r.status,
            headcount: r.headcount,
            seriousBlocker: r.serious_blocker,
            safetyIncident: r.safety_incident,
            flagged: r.flagged
          }
        : null,
      attendance,
      geofenceFlags: count(["geofence_check_in", "geofence_check_out"]),
      visitsNotClosed: count(["visit_not_closed"]),
      pendingCorrections: count(["correction_pending"]),
      lowStock: lowStockBySite.get(site.id)?.size ?? 0
    });
  }
  return out;
}

const hasSomethingToLookAt = (r: BoardRow) =>
  r.report?.status === "rejected" || r.attendance === "awaiting_review" || r.attendance === "sent_back" ||
  r.geofenceFlags + r.visitsNotClosed + r.pendingCorrections + r.lowStock > 0;

// Lower comes first: what a manager must act on today, then what is missing.
function rank(r: BoardRow): number {
  if (r.report?.flagged) return 0;
  if (!r.report) return 1;
  if (r.attendance === "not_recorded") return 2;
  if (hasSomethingToLookAt(r)) return 3;
  return 4;
}

// By rank, then site name, then id, so the order is the same on every render.
export function sortBoard(rows: readonly BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (a.siteName !== b.siteName) return a.siteName < b.siteName ? -1 : 1;
    return a.siteId < b.siteId ? -1 : a.siteId > b.siteId ? 1 : 0;
  });
}

export type BoardSummary = {
  activeSites: number;
  filed: number;
  notFiled: number;
  attendanceNotRecorded: number;
  flagged: number;
  waitingForReview: number;
  sentBack: number;
};

// "Not filed" and "attendance not recorded" count active sites only: an inactive
// site is not expected to report. Waiting for review is every submitted report,
// every day awaiting review and every pending correction. A sent-back report is
// filed but waits on its author, not a manager, so it is counted apart (ADR-043).
export function summarise(rows: readonly BoardRow[]): BoardSummary {
  const active = rows.filter((r) => r.siteStatus === "active");
  return {
    activeSites: active.length,
    filed: rows.filter((r) => r.report).length,
    notFiled: active.filter((r) => !r.report).length,
    attendanceNotRecorded: active.filter((r) => r.attendance === "not_recorded").length,
    flagged: rows.filter((r) => r.report?.flagged).length,
    waitingForReview: rows.reduce(
      (n, r) =>
        n + (r.report?.status === "submitted" ? 1 : 0) + (r.attendance === "awaiting_review" ? 1 : 0) + r.pendingCorrections,
      0
    ),
    sentBack: rows.filter((r) => r.report?.status === "rejected").length
  };
}

import type { AttendanceState, BoardRow } from "./board";

// What the Overview screen shows (docs/DESIGN.md section 4, "Owner/PM Overview"),
// built only from the board, which reads published views (ADR-041). No number here
// has a source of its own: each one is a sum over the board's rows.

export type OverviewStats = { activeSites: number; headcountReported: number; toApprove: number; lowStock: number };

/**
 * The four stat cards. "Headcount reported" sums the day's report headcounts: no
 * published view gives live presence for a day not yet approved, so the card says
 * where the number comes from. "To approve" is reports filed and waiting for review,
 * days awaiting review and pending corrections (as summarise()'s waitingForReview).
 */
export function overviewStats(rows: readonly BoardRow[]): OverviewStats {
  return {
    activeSites: rows.filter((r) => r.siteStatus === "active").length,
    headcountReported: rows.reduce((n, r) => n + (r.report?.headcount ?? 0), 0),
    toApprove: rows.reduce(
      (n, r) => n + (r.report?.status === "submitted" ? 1 : 0) + (r.attendance === "awaiting_review" ? 1 : 0) + r.pendingCorrections,
      0
    ),
    lowStock: rows.reduce((n, r) => n + r.lowStock, 0)
  };
}

export const DAY_WORD: Record<AttendanceState, string> = {
  approved: "Approved",
  awaiting_review: "Needs approval",
  sent_back: "Sent back",
  not_recorded: "Not started"
};

export function reportWord(row: BoardRow): string {
  if (!row.report) return "Not filed";
  if (row.report.status === "rejected") return "Sent back";
  if (row.report.status === "reviewed") return "Reviewed";
  return "Filed";
}

export type NeedsYouItem = { key: string; text: string; action: string; href: string; primary: boolean };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "Needs you": one item per thing a manager can act on today, with its one action.
 * A report or day that was sent back waits on its author, and a report not filed
 * waits on the site, so neither is listed here; the table shows both.
 */
export function needsYou(rows: readonly BoardRow[], org: string, date: string): NeedsYouItem[] {
  const q = encodeURIComponent(org);
  const out: NeedsYouItem[] = [];
  for (const r of rows) {
    const attendance = `/attendance?org=${q}&site=${encodeURIComponent(r.siteId)}&from=${date}&to=${date}&status=all`;
    if (r.attendance === "awaiting_review") {
      out.push({ key: `${r.siteId}:day`, text: `${r.siteName} · attendance waiting for approval`, action: "Approve", href: attendance, primary: true });
    }
    if (r.pendingCorrections > 0) {
      out.push({ key: `${r.siteId}:corr`, text: `${r.siteName} · ${plural(r.pendingCorrections, "correction")} waiting`, action: "Review", href: attendance, primary: true });
    }
    if (r.report && r.report.status === "submitted") {
      const flag = r.report.flagged ? " (flagged)" : "";
      out.push({ key: `${r.siteId}:report`, text: `${r.siteName} · report waiting for review${flag}`, action: "Review", href: `/reports/${encodeURIComponent(r.report.id)}?org=${q}`, primary: true });
    } else if (r.report?.flagged && r.report.status !== "rejected") {
      out.push({ key: `${r.siteId}:flag`, text: `${r.siteName} · flagged report`, action: "Open", href: `/reports/${encodeURIComponent(r.report.id)}?org=${q}`, primary: false });
    }
    if (r.geofenceFlags + r.visitsNotClosed > 0) {
      const parts = [r.geofenceFlags > 0 && plural(r.geofenceFlags, "geofence flag"), r.visitsNotClosed > 0 && `${plural(r.visitsNotClosed, "visit")} not checked out`].filter(Boolean);
      out.push({ key: `${r.siteId}:visits`, text: `${r.siteName} · ${parts.join(", ")}`, action: "Check", href: attendance, primary: false });
    }
    if (r.lowStock > 0) {
      out.push({ key: `${r.siteId}:stock`, text: `${r.siteName} · ${plural(r.lowStock, "material")} low or below zero`, action: "Open", href: `/materials?org=${q}&site=${encodeURIComponent(r.siteId)}`, primary: false });
    }
  }
  return out;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 30 Oct · Asia/Kolkata" for a YYYY-MM-DD day. The page's days are India time. */
export function eyebrowFor(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "Asia/Kolkata";
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY[day]} ${d} ${MONTH[m - 1]} · Asia/Kolkata`;
}

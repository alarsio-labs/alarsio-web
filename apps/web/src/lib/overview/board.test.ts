import { describe, expect, it } from "vitest";
import { buildBoard, sortBoard, summarise, type BoardRow } from "./board";
import type { AlertRow, ApprovedDayRow, OverviewExceptionRow, OverviewReportRow } from "./rows";
import type { SiteRow } from "../reports/rows";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "cccccccc-0000-4000-8000-00000000000c";
const D = "dddddddd-0000-4000-8000-00000000000d";

const site = (id: string, name: string, status = "active"): SiteRow => ({ id, name, status });
const report = (over: Partial<OverviewReportRow> & { site_id: string }): OverviewReportRow => ({
  id: `r-${over.site_id}`,
  status: "submitted",
  headcount: 10,
  serious_blocker: false,
  safety_incident: false,
  flagged: false,
  ...over
});
const x = (site_id: string, kind: OverviewExceptionRow["kind"]): OverviewExceptionRow => ({ site_id, kind });

type Input = {
  sites?: SiteRow[];
  reports?: OverviewReportRow[];
  exceptions?: OverviewExceptionRow[];
  approved?: ApprovedDayRow[];
  alerts?: AlertRow[];
};
const board = (i: Input) =>
  buildBoard({
    sites: i.sites ?? [],
    reports: i.reports ?? [],
    exceptions: i.exceptions ?? [],
    approvedDays: i.approved ?? [],
    alerts: i.alerts ?? []
  });
const one = (i: Input): BoardRow => {
  const [row, ...rest] = board(i);
  expect(rest).toEqual([]);
  if (!row) throw new Error("expected one row, got none");
  return row;
};

describe("buildBoard: which sites are listed", () => {
  it("lists every active site, even one with nothing that day", () => {
    const row = one({ sites: [site(A, "Alpha")] });
    expect(row).toMatchObject({ siteId: A, siteName: "Alpha", report: null, attendance: "not_recorded", lowStock: 0 });
  });

  it("lists a site in another status only when it has a report or attendance that day", () => {
    const rows = board({
      sites: [site(A, "Paused with report", "paused"), site(B, "Completed with a day", "completed"), site(C, "Archived, quiet", "archived"), site(D, "Planned, quiet", "planned")],
      reports: [report({ site_id: A })],
      exceptions: [x(B, "day_awaiting_review")]
    });
    expect(rows.map((r) => r.siteId).sort()).toEqual([A, B].sort());
  });

  it("lists an inactive site for an exception alone, with no report and no attendance day", () => {
    const row = one({ sites: [site(A, "Completed", "completed")], exceptions: [x(A, "correction_pending")] });
    expect(row).toMatchObject({ siteId: A, report: null, attendance: "not_recorded", pendingCorrections: 1 });
  });

  it("does not list a quiet inactive site for its low stock alone", () => {
    expect(board({ sites: [site(C, "Archived", "archived")], alerts: [{ site_id: C, material_id: "m1", alert: "low" }] })).toEqual([]);
  });

  it("ignores rows for a site the caller cannot see in the directory", () => {
    const row = one({
      sites: [site(A, "Alpha")],
      reports: [report({ site_id: B })],
      exceptions: [x(B, "correction_pending")],
      approved: [{ site_id: B }],
      alerts: [{ site_id: B, material_id: "m1", alert: "low" }]
    });
    expect(row).toMatchObject({ report: null, attendance: "not_recorded", pendingCorrections: 0, lowStock: 0 });
  });
});

describe("buildBoard: what a row says", () => {
  it("carries the report's id, status, headcount and both flags", () => {
    const row = one({
      sites: [site(A, "Alpha")],
      reports: [report({ site_id: A, id: "r9", status: "reviewed", headcount: 23, serious_blocker: true, safety_incident: true, flagged: true })]
    });
    expect(row.report).toEqual({ id: "r9", status: "reviewed", headcount: 23, seriousBlocker: true, safetyIncident: true, flagged: true });
  });

  it("keeps a sent-back report on its site's line, never as a missing one (#116)", () => {
    const row = one({ sites: [site(A, "Alpha")], reports: [report({ site_id: A, status: "rejected", headcount: 7 })] });
    expect(row.report).toMatchObject({ id: `r-${A}`, status: "rejected", headcount: 7 });
  });

  it("reads attendance as approved, awaiting review, sent back or not recorded", () => {
    expect(one({ sites: [site(A, "a")], approved: [{ site_id: A }, { site_id: A }] }).attendance).toBe("approved");
    expect(one({ sites: [site(A, "a")], exceptions: [x(A, "day_awaiting_review")] }).attendance).toBe("awaiting_review");
    expect(one({ sites: [site(A, "a")], exceptions: [x(A, "day_rejected")] }).attendance).toBe("sent_back");
    expect(one({ sites: [site(A, "a")] }).attendance).toBe("not_recorded");
  });

  it("reads an approved day with no entries as not recorded (ADR-041 D3, the known gap)", () => {
    // approved_attendance_days has one row per entry, so such a day leaves no row.
    expect(one({ sites: [site(A, "a")], approved: [] }).attendance).toBe("not_recorded");
  });

  it("counts geofence flags, visits not closed and pending corrections apart", () => {
    const row = one({
      sites: [site(A, "a")],
      exceptions: [
        x(A, "geofence_check_in"),
        x(A, "geofence_check_out"),
        x(A, "geofence_check_in"),
        x(A, "visit_not_closed"),
        x(A, "correction_pending"),
        x(A, "correction_pending")
      ]
    });
    expect(row).toMatchObject({ geofenceFlags: 3, visitsNotClosed: 1, pendingCorrections: 2 });
  });

  it("counts each low or negative material once", () => {
    const row = one({
      sites: [site(A, "a")],
      alerts: [
        { site_id: A, material_id: "m1", alert: "low" },
        { site_id: A, material_id: "m2", alert: "negative" },
        { site_id: A, material_id: "m2", alert: "negative" }
      ]
    });
    expect(row.lowStock).toBe(2);
  });
});

describe("sortBoard", () => {
  it("puts a flagged report first, then no report, then no attendance, then anything to look at, then the rest", () => {
    const rows = board({
      sites: [site("s1", "Quiet"), site("s2", "Low stock"), site("s3", "No attendance"), site("s4", "No report"), site("s5", "Flagged")],
      reports: [
        report({ site_id: "s1" }),
        report({ site_id: "s2" }),
        report({ site_id: "s3" }),
        report({ site_id: "s5", flagged: true, safety_incident: true })
      ],
      approved: [{ site_id: "s1" }, { site_id: "s2" }, { site_id: "s4" }, { site_id: "s5" }],
      alerts: [{ site_id: "s2", material_id: "m1", alert: "low" }]
    });
    expect(sortBoard(rows).map((r) => r.siteName)).toEqual(["Flagged", "No report", "No attendance", "Low stock", "Quiet"]);
  });

  it("puts a sent-back report with anything to look at, and a flagged one first (ADR-043 D3)", () => {
    const rows = board({
      sites: [site("s1", "Quiet"), site("s2", "Sent back"), site("s3", "No report"), site("s4", "Flagged, sent back")],
      reports: [
        report({ site_id: "s1" }),
        report({ site_id: "s2", status: "rejected" }),
        report({ site_id: "s4", status: "rejected", flagged: true, serious_blocker: true })
      ],
      approved: [{ site_id: "s1" }, { site_id: "s2" }, { site_id: "s3" }, { site_id: "s4" }]
    });
    expect(sortBoard(rows).map((r) => r.siteName)).toEqual(["Flagged, sent back", "No report", "Sent back", "Quiet"]);
  });

  it("orders by name within a group, then by id, the same on every call", () => {
    const rows = board({ sites: [site(B, "Same"), site(C, "Beta"), site(A, "Same")] });
    expect(sortBoard(rows).map((r) => r.siteId)).toEqual([C, A, B]);
    expect(sortBoard([...rows].reverse()).map((r) => r.siteId)).toEqual([C, A, B]);
  });
});

describe("summarise", () => {
  it("counts a worked example by hand", () => {
    // Three active sites and one paused site that filed.
    //   A: filed, flagged, not reviewed; day awaiting review; 2 corrections waiting.
    //   B: filed and reviewed; day approved.
    //   C: nothing.
    //   D (paused): filed, not reviewed; day sent back.
    // Waiting for a review: reports A and D (2) + day A (1) + corrections (2) = 5.
    const rows = board({
      sites: [site(A, "A"), site(B, "B"), site(C, "C"), site(D, "D", "paused")],
      reports: [
        report({ site_id: A, flagged: true, serious_blocker: true }),
        report({ site_id: B, status: "reviewed" }),
        report({ site_id: D })
      ],
      exceptions: [x(A, "day_awaiting_review"), x(A, "correction_pending"), x(A, "correction_pending"), x(D, "day_rejected")],
      approved: [{ site_id: B }]
    });
    expect(summarise(rows)).toEqual({
      activeSites: 3,
      filed: 3,
      notFiled: 1,
      attendanceNotRecorded: 1,
      flagged: 1,
      waitingForReview: 5,
      sentBack: 0
    });
  });

  it("counts a sent-back report as filed and sent back, never as not filed or waiting for a review (ADR-043)", () => {
    // A: sent back by a manager, waiting on its author. B: submitted. C: nothing.
    // Waiting for a review: report B only (1). Not filed: C only (1).
    const rows = board({
      sites: [site(A, "A"), site(B, "B"), site(C, "C")],
      reports: [report({ site_id: A, status: "rejected" }), report({ site_id: B })],
      approved: [{ site_id: A }, { site_id: B }, { site_id: C }]
    });
    expect(summarise(rows)).toEqual({
      activeSites: 3,
      filed: 2,
      notFiled: 1,
      attendanceNotRecorded: 0,
      flagged: 0,
      waitingForReview: 1,
      sentBack: 1
    });
  });

  it("leaves a listed inactive site out of 'not filed' and 'no attendance'", () => {
    // E is paused, kept on the board by a geofence flag, with no report and no day.
    const E = "eeeeeeee-0000-4000-8000-00000000000e";
    const rows = board({ sites: [site(A, "A"), site(E, "E", "paused")], exceptions: [x(E, "geofence_check_in")] });
    expect(rows.map((r) => r.siteId).sort()).toEqual([A, E].sort());
    expect(summarise(rows)).toMatchObject({ activeSites: 1, notFiled: 1, attendanceNotRecorded: 1 });
  });

  it("is all zeros for an empty board", () => {
    expect(summarise([])).toEqual({ activeSites: 0, filed: 0, notFiled: 0, attendanceNotRecorded: 0, flagged: 0, waitingForReview: 0, sentBack: 0 });
  });
});

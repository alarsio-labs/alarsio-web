import { describe, expect, it } from "vitest";
import type { BoardRow } from "./board";
import { needsYou, overviewStats, reportWord } from "./screen";

const row = (over: Partial<BoardRow> = {}): BoardRow => ({
  siteId: "s1",
  siteName: "Baner",
  siteStatus: "active",
  report: null,
  attendance: "not_recorded",
  geofenceFlags: 0,
  visitsNotClosed: 0,
  pendingCorrections: 0,
  lowStock: 0,
  ...over
});
const report = (status: "submitted" | "rejected" | "reviewed", headcount: number | null = 10, flagged = false) => ({
  id: "r1", status, headcount, seriousBlocker: false, safetyIncident: false, flagged
});

describe("overviewStats", () => {
  it("is all zero for no sites", () => {
    expect(overviewStats([])).toEqual({ activeSites: 0, headcountReported: 0, toApprove: 0, lowStock: 0 });
  });

  it("counts only active sites, and skips a report with no headcount", () => {
    const s = overviewStats([
      row({ report: report("submitted", 18) }),
      row({ siteId: "s2", report: report("reviewed", null) }),
      row({ siteId: "s3", siteStatus: "paused", report: report("reviewed", 4) })
    ]);
    expect(s.activeSites).toBe(2);
    expect(s.headcountReported).toBe(22);
  });

  it("counts reports to review, days awaiting review and corrections as to approve, but not a sent-back report", () => {
    const s = overviewStats([
      row({ report: report("submitted"), attendance: "awaiting_review", pendingCorrections: 2 }),
      row({ siteId: "s2", report: report("rejected"), attendance: "sent_back" })
    ]);
    expect(s.toApprove).toBe(4);
  });

  it("adds up low-stock materials across sites", () => {
    expect(overviewStats([row({ lowStock: 2 }), row({ siteId: "s2", lowStock: 1 })]).lowStock).toBe(3);
  });
});

describe("needsYou", () => {
  it("lists nothing when nothing waits on a manager", () => {
    expect(needsYou([row(), row({ siteId: "s2", report: report("rejected"), attendance: "sent_back" })], "o1", "2026-10-30")).toEqual([]);
  });

  it("gives one item with one action for each thing to act on, approvals first in each site", () => {
    const items = needsYou([row({ attendance: "awaiting_review", pendingCorrections: 1, report: report("submitted", 5, true), geofenceFlags: 2, lowStock: 1 })], "o1", "2026-10-30");
    expect(items.map((i) => i.action)).toEqual(["Approve", "Review", "Review", "Check", "Open"]);
    expect(items[2]?.text).toBe("Baner · report waiting for review (flagged)");
    expect(items[0]?.href).toBe("/attendance?org=o1&site=s1&from=2026-10-30&to=2026-10-30&status=all");
    expect(items[2]?.href).toBe("/reports/r1?org=o1");
    expect(items[4]?.href).toBe("/materials?org=o1&site=s1");
  });

  it("lists a flagged report already reviewed once, as Open", () => {
    const items = needsYou([row({ report: report("reviewed", 5, true) })], "o1", "2026-10-30");
    expect(items).toHaveLength(1);
    expect(items[0]?.action).toBe("Open");
  });
});

describe("reportWord", () => {
  it("uses the app's words for each report state", () => {
    expect(reportWord(row())).toBe("Not filed");
    expect(reportWord(row({ report: report("submitted") }))).toBe("Filed");
    expect(reportWord(row({ report: report("rejected") }))).toBe("Sent back");
    expect(reportWord(row({ report: report("reviewed") }))).toBe("Reviewed");
  });
});

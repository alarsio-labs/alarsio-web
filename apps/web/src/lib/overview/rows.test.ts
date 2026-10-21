import { describe, expect, it } from "vitest";
import { isAlertRow, isApprovedDayRow, isOverviewExceptionRow, isOverviewReportRow, strictRows } from "./rows";

const SITE = "aaaaaaaa-0000-4000-8000-00000000000a";

describe("isOverviewReportRow", () => {
  const good = {
    id: "r1",
    site_id: SITE,
    status: "submitted",
    headcount: 12,
    serious_blocker: false,
    safety_incident: true,
    flagged: true
  };

  it("accepts a submitted or reviewed report, with or without a headcount", () => {
    expect(isOverviewReportRow(good)).toBe(true);
    expect(isOverviewReportRow({ ...good, status: "reviewed", headcount: null })).toBe(true);
  });

  it("accepts a sent-back report, which daily_report_status shows as rejected (ADR-042, #116)", () => {
    expect(isOverviewReportRow({ ...good, status: "rejected" })).toBe(true);
  });

  it("rejects a draft, a missing flag and a headcount that is not a number", () => {
    expect(isOverviewReportRow({ ...good, status: "draft" })).toBe(false);
    expect(isOverviewReportRow({ ...good, flagged: undefined })).toBe(false);
    expect(isOverviewReportRow({ ...good, headcount: "12" })).toBe(false);
    expect(isOverviewReportRow(null)).toBe(false);
  });
});

describe("isOverviewExceptionRow", () => {
  it("accepts every published kind and nothing else", () => {
    expect(isOverviewExceptionRow({ site_id: SITE, kind: "correction_pending" })).toBe(true);
    expect(isOverviewExceptionRow({ site_id: SITE, kind: "day_rejected" })).toBe(true);
    expect(isOverviewExceptionRow({ site_id: SITE, kind: "something_new" })).toBe(false);
    expect(isOverviewExceptionRow({ kind: "day_rejected" })).toBe(false);
  });
});

describe("isApprovedDayRow and isAlertRow", () => {
  it("need a site id, and an alert of low or negative", () => {
    expect(isApprovedDayRow({ site_id: SITE })).toBe(true);
    expect(isApprovedDayRow({ site_id: 7 })).toBe(false);
    expect(isAlertRow({ site_id: SITE, material_id: "m1", alert: "negative" })).toBe(true);
    expect(isAlertRow({ site_id: SITE, material_id: "m1", alert: "high" })).toBe(false);
  });
});

describe("strictRows", () => {
  it("returns every row when each one passes the guard", () => {
    expect(strictRows([{ site_id: SITE }, { site_id: "b" }], isApprovedDayRow)).toEqual([{ site_id: SITE }, { site_id: "b" }]);
    expect(strictRows([], isApprovedDayRow)).toEqual([]);
  });

  // A row the page cannot read is a failed read, never a missing one (ADR-041 D8, #116):
  // dropping a sent-back report is how its site came to read as "not filed".
  it("returns null when any one row fails the guard, or the data is not a list", () => {
    expect(strictRows([{ site_id: SITE }, { site_id: 7 }], isApprovedDayRow)).toBeNull();
    expect(strictRows(null, isApprovedDayRow)).toBeNull();
    expect(strictRows({ site_id: SITE }, isApprovedDayRow)).toBeNull();
  });
});

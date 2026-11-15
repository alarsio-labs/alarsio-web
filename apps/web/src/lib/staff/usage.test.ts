import { describe, expect, it } from "vitest";
import { isTestOrg, isUsageRow, istDate, istDateTime, shapeUsage, weekLabels, type UsageRow, type UsageView } from "./usage";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  org_id: "10000000-0000-4000-8000-00000000000a",
  org_name: "Sharma Builders",
  created_at: "2026-10-01T10:00:00+00:00",
  owners: 1,
  project_managers: 0,
  supervisors: 2,
  accountants: 0,
  active_users_28d: 2,
  sites: 3,
  workers: 40,
  attendance_marks: 120,
  daily_reports: 15,
  material_entries: 9,
  site_check_ins: 7,
  last_active: "2026-11-13T21:00:00+00:00",
  last_sign_in: "2026-11-14T03:30:00+00:00",
  week_start: "2026-11-09",
  weekly_records: [1, 2, 3, 4],
  ...over
});

// The one organisation shown, or a failure that says so.
function only(rows: UsageRow[]): UsageView {
  const shown = shapeUsage(rows, { showTest: false }).rows;
  if (shown.length !== 1 || !shown[0]) throw new Error(`expected one organisation, got ${shown.length}`);
  return shown[0];
}

describe("isUsageRow", () => {
  it("accepts a full row, and nulls only where the database may send them", () => {
    expect(isUsageRow(row())).toBe(true);
    expect(isUsageRow(row({ last_active: null, last_sign_in: null }))).toBe(true);
  });

  it("rejects a missing count, a count that is a string, and a week list of the wrong size", () => {
    expect(isUsageRow({ ...row(), sites: undefined })).toBe(false);
    expect(isUsageRow({ ...row(), workers: "40" })).toBe(false);
    expect(isUsageRow({ ...row(), weekly_records: [1, 2, 3] })).toBe(false);
    expect(isUsageRow({ ...row(), weekly_records: [1, 2, 3, "4"] })).toBe(false);
    expect(isUsageRow({ ...row(), week_start: "09 Nov" })).toBe(false);
    expect(isUsageRow(null)).toBe(false);
  });
});

describe("isTestOrg", () => {
  it("hides test and demo organisations, whatever the case", () => {
    for (const n of ["Audit Test Co", "test org", "Sharma Constructions (Demo)", "ACME (demo)", "QA TEST"]) {
      expect(isTestOrg(n), n).toBe(true);
    }
  });

  it("keeps a real customer whose name merely contains the letters", () => {
    for (const n of ["Latest Builders", "Contest Homes", "Sharma Builders", "Attestation Infra"]) {
      expect(isTestOrg(n), n).toBe(false);
    }
  });
});

describe("IST dates", () => {
  it("shows a UTC instant on the Indian calendar day, not the UTC one", () => {
    // 20:00 UTC on 14 Nov is 01:30 IST on 15 Nov.
    expect(istDate("2026-11-14T20:00:00+00:00")).toBe("15 Nov 2026");
    expect(istDate("2026-11-14T18:29:00+00:00")).toBe("14 Nov 2026");
    expect(istDate("2026-11-14T18:30:00+00:00")).toBe("15 Nov 2026");
  });

  it("shows a date and time in IST, and a dash for nothing", () => {
    expect(istDateTime("2026-11-14T20:00:00+00:00")).toBe("15 Nov 2026, 01:30 IST");
    expect(istDateTime(null)).toBe("—");
    expect(istDate(null)).toBe("—");
  });
});

describe("weekLabels", () => {
  it("names the last four Monday-to-Sunday weeks, oldest first, ending with the current one", () => {
    expect(weekLabels("2026-11-09")).toEqual(["19 Oct – 25 Oct", "26 Oct – 1 Nov", "2 Nov – 8 Nov", "9 Nov – 15 Nov"]);
  });

  it("crosses a year end", () => {
    expect(weekLabels("2026-12-28")).toEqual(["7 Dec – 13 Dec", "14 Dec – 20 Dec", "21 Dec – 27 Dec", "28 Dec – 3 Jan"]);
  });
});

describe("shapeUsage", () => {
  const rows = [
    row({ org_id: "10000000-0000-4000-8000-0000000000b1", org_name: "Zed Infra", created_at: "2026-10-20T00:00:00+00:00" }),
    row({ org_id: "10000000-0000-4000-8000-0000000000b2", org_name: "Audit Test Co", created_at: "2026-10-02T00:00:00+00:00" }),
    row({ org_id: "10000000-0000-4000-8000-0000000000b3", org_name: "Sharma Constructions (Demo)", created_at: "2026-10-03T00:00:00+00:00" }),
    row({ org_id: "10000000-0000-4000-8000-0000000000b4", org_name: "Alpha Builders", created_at: "2026-10-05T00:00:00+00:00" })
  ];

  it("hides test organisations by default, says how many, and orders by account date", () => {
    const s = shapeUsage(rows, { showTest: false });
    expect(s.rows.map((r) => r.name)).toEqual(["Alpha Builders", "Zed Infra"]);
    expect(s.hidden).toBe(2);
  });

  it("shows them all when asked, with nothing hidden", () => {
    const s = shapeUsage(rows, { showTest: true });
    expect(s.rows.map((r) => r.name)).toEqual(["Audit Test Co", "Sharma Constructions (Demo)", "Alpha Builders", "Zed Infra"]);
    expect(s.hidden).toBe(0);
  });

  it("turns one database row into what the page prints, without anything personal", () => {
    const r = only([row()]);
    expect(r).toEqual({
      orgId: "10000000-0000-4000-8000-00000000000a",
      name: "Sharma Builders",
      created: "1 Oct 2026",
      members: "3 (1 owner, 2 supervisors)",
      activeUsers: 2,
      sites: 3,
      workers: 40,
      attendance: 120,
      reports: 15,
      materials: 9,
      checkIns: 7,
      lastActive: "14 Nov 2026, 02:30 IST",
      lastSignIn: "14 Nov 2026, 09:00 IST",
      weeks: [1, 2, 3, 4]
    });
    expect(Object.keys(r).join(" ")).not.toMatch(/email|phone|worker_name/i);
  });

  it("writes an organisation with no members and no records as dashes and zeros", () => {
    const r = only([
      row({ owners: 0, supervisors: 0, active_users_28d: 0, attendance_marks: 0, last_active: null, last_sign_in: null, weekly_records: [0, 0, 0, 0] })
    ]);
    expect(r.members).toBe("0");
    expect(r.lastActive).toBe("—");
    expect(r.lastSignIn).toBe("—");
  });

  it("takes its week labels from the database's Monday, so the page's clock cannot move them", () => {
    expect(shapeUsage([row({ week_start: "2026-11-02" })], { showTest: false }).weekLabels).toEqual([
      "12 Oct – 18 Oct",
      "19 Oct – 25 Oct",
      "26 Oct – 1 Nov",
      "2 Nov – 8 Nov"
    ]);
  });

  it("has no week labels when there is no organisation to show", () => {
    expect(shapeUsage([], { showTest: false })).toEqual({ rows: [], hidden: 0, weekLabels: [] });
  });
});

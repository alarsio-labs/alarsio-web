import { describe, expect, it } from "vitest";
import { parseOverviewParams, previousDay } from "./params";

// 20 Oct 2026, 20:00 UTC is already 21 Oct in Kolkata (UTC+5:30).
const LATE_UTC = new Date("2026-10-20T20:00:00Z");
const NOON_UTC = new Date("2026-10-20T12:00:00Z");

describe("parseOverviewParams", () => {
  it("defaults to today in India time, not UTC", () => {
    expect(parseOverviewParams({}, NOON_UTC)).toEqual({ date: "2026-10-20" });
    expect(parseOverviewParams({}, LATE_UTC)).toEqual({ date: "2026-10-21" });
  });

  it("keeps a real calendar date", () => {
    expect(parseOverviewParams({ date: "2026-02-28" }, NOON_UTC)).toEqual({ date: "2026-02-28" });
    expect(parseOverviewParams({ date: "2028-02-29" }, NOON_UTC)).toEqual({ date: "2028-02-29" });
  });

  it("falls back to today for a malformed, impossible or repeated date", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "20-10-2026", "2026-10-20'; drop", "", "today"]) {
      expect(parseOverviewParams({ date: bad }, NOON_UTC)).toEqual({ date: "2026-10-20" });
    }
    expect(parseOverviewParams({ date: ["2026-10-01", "2026-10-02"] }, NOON_UTC)).toEqual({ date: "2026-10-20" });
  });
});

describe("previousDay", () => {
  it("steps back one calendar day across a month, a year and a leap day", () => {
    expect(previousDay("2026-11-07")).toBe("2026-11-06");
    expect(previousDay("2026-11-01")).toBe("2026-10-31");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS, parseAttendanceFilters } from "./filters";

const NOW = new Date("2026-10-20T10:00:00Z");
const SITE = "51000000-0000-4000-8000-000000000001";

describe("parseAttendanceFilters", () => {
  it("defaults to Needs review over the 31 days ending today in Kolkata", () => {
    expect(DEFAULT_RANGE_DAYS).toBe(31);
    expect(parseAttendanceFilters({}, NOW)).toEqual({ site: null, status: "needs_review", from: "2026-09-20", to: "2026-10-20" });
  });

  it("uses the Kolkata date for today, not the UTC one", () => {
    const f = parseAttendanceFilters({}, new Date("2026-10-20T18:31:00Z"));
    expect(f.to).toBe("2026-10-21");
    expect(f.from).toBe("2026-09-21");
  });

  it("accepts a uuid site, a known status and real dates", () => {
    const f = parseAttendanceFilters({ site: SITE, status: "approved", from: "2026-10-01", to: "2026-10-10" }, NOW);
    expect(f).toEqual({ site: SITE, status: "approved", from: "2026-10-01", to: "2026-10-10" });
  });

  it("knows all five statuses and falls back for anything else", () => {
    for (const status of ["needs_review", "open", "rejected", "approved", "all"]) {
      expect(parseAttendanceFilters({ status }, NOW).status).toBe(status);
    }
    for (const status of ["submitted", "x", "", ["open"]]) {
      expect(parseAttendanceFilters({ status }, NOW).status).toBe("needs_review");
    }
  });

  it("ignores a site that is not a uuid", () => {
    expect(parseAttendanceFilters({ site: "1; drop table" }, NOW).site).toBeNull();
    expect(parseAttendanceFilters({ site: [SITE] }, NOW).site).toBeNull();
  });

  it("falls back to the default range for a bad or impossible date", () => {
    const d = { from: "2026-09-20", to: "2026-10-20" };
    expect(parseAttendanceFilters({ from: "nope", to: "nope" }, NOW)).toMatchObject(d);
    expect(parseAttendanceFilters({ from: "2026-13-01", to: "2026-13-01" }, NOW)).toMatchObject(d);
    expect(parseAttendanceFilters({ from: "2026-02-30", to: "2026-10-20" }, NOW).from).toBe("2026-09-20");
  });

  it("falls back to the default range when it is reversed", () => {
    expect(parseAttendanceFilters({ from: "2026-10-10", to: "2026-10-01" }, NOW)).toMatchObject({ from: "2026-09-20", to: "2026-10-20" });
  });

  it("cuts a longer range to the 31 days ending at `to`, and keeps exactly 31", () => {
    expect(MAX_RANGE_DAYS).toBe(31);
    expect(parseAttendanceFilters({ from: "2026-01-01", to: "2026-10-10" }, NOW)).toMatchObject({ from: "2026-09-10", to: "2026-10-10" });
    expect(parseAttendanceFilters({ from: "2026-09-10", to: "2026-10-10" }, NOW)).toMatchObject({ from: "2026-09-10", to: "2026-10-10" });
  });

  it("takes only `to` and counts 31 days back from it", () => {
    expect(parseAttendanceFilters({ to: "2026-10-05" }, NOW)).toMatchObject({ from: "2026-09-05", to: "2026-10-05" });
  });
});

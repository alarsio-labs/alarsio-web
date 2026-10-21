import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE_DAYS, MAX_RANGE_DAYS, parseReportFilters } from "./filters";

const TODAY = new Date("2026-10-19T10:00:00Z");
const SITE = "51000000-0000-0000-0000-000000000001";

describe("parseReportFilters", () => {
  it("defaults to the last 7 days, submitted and reviewed, all sites", () => {
    expect(parseReportFilters({}, TODAY)).toEqual({
      site: null,
      status: "all",
      flaggedOnly: false,
      from: "2026-10-13",
      to: "2026-10-19"
    });
    expect(DEFAULT_RANGE_DAYS).toBe(7);
  });

  it("accepts a valid site, status, flag and range", () => {
    expect(
      parseReportFilters(
        { site: SITE, status: "submitted", flagged: "1", from: "2026-10-01", to: "2026-10-10" },
        TODAY
      )
    ).toEqual({ site: SITE, status: "submitted", flaggedOnly: true, from: "2026-10-01", to: "2026-10-10" });
  });

  it("ignores a site that is not a uuid", () => {
    for (const bad of ["x", "1; drop table sites", SITE + "0", "", ["a", "b"], undefined]) {
      expect(parseReportFilters({ site: bad }, TODAY).site).toBeNull();
    }
  });

  it("never lets draft or an unknown status through", () => {
    for (const bad of ["draft", "reviewed;", "ALL", "", ["submitted"], undefined]) {
      expect(parseReportFilters({ status: bad }, TODAY).status).toBe("all");
    }
    expect(parseReportFilters({ status: "reviewed" }, TODAY).status).toBe("reviewed");
    expect(parseReportFilters({ status: "rejected" }, TODAY).status).toBe("rejected");
  });

  it("treats only the value 1 as flagged only", () => {
    expect(parseReportFilters({ flagged: "true" }, TODAY).flaggedOnly).toBe(false);
    expect(parseReportFilters({ flagged: "0" }, TODAY).flaggedOnly).toBe(false);
  });

  it("falls back to the default range for an impossible or malformed date", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "19-10-2026", "2026-10-1", "x", ""]) {
      const f = parseReportFilters({ from: bad, to: "2026-10-10" }, TODAY);
      expect(f.from).toBe("2026-10-04");
      expect(f.to).toBe("2026-10-10");
    }
    expect(parseReportFilters({ from: "nope", to: "nope" }, TODAY)).toMatchObject({
      from: "2026-10-13",
      to: "2026-10-19"
    });
  });

  it("falls back to the default range when from is after to", () => {
    const f = parseReportFilters({ from: "2026-10-15", to: "2026-10-10" }, TODAY);
    expect(f).toMatchObject({ from: "2026-10-13", to: "2026-10-19" });
  });

  it("clamps a range longer than 31 days to the 31 days ending at to", () => {
    const f = parseReportFilters({ from: "2026-01-01", to: "2026-10-10" }, TODAY);
    expect(f.to).toBe("2026-10-10");
    expect(f.from).toBe("2026-09-10");
    expect(MAX_RANGE_DAYS).toBe(31);
  });

  it("keeps a range of exactly 31 days", () => {
    const f = parseReportFilters({ from: "2026-09-10", to: "2026-10-10" }, TODAY);
    expect(f.from).toBe("2026-09-10");
  });
  it("uses today as the end when only from is given, and the default range when from is then after today", () => {
    expect(parseReportFilters({ from: "2026-10-15" }, TODAY)).toMatchObject({ from: "2026-10-15", to: "2026-10-19" });
    expect(parseReportFilters({ from: "2026-10-25" }, TODAY)).toMatchObject({ from: "2026-10-13", to: "2026-10-19" });
  });
});

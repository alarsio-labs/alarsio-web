import { describe, expect, it } from "vitest";
import { SAMPLE_ROSTER, SAMPLE_WEEKS, describeDay, levelOf, monthLabels, sampleSeason, seasonStats, shortDate } from "./sample-site";

describe("sample site season", () => {
  const days = sampleSeason();

  it("is whole weeks, Sunday first, and the same every time", () => {
    expect(days).toHaveLength(SAMPLE_WEEKS * 7);
    expect(days[0]?.weekday).toBe(0);
    expect(days.at(-1)?.weekday).toBe(6);
    expect(sampleSeason()).toEqual(days);
  });

  it("never works Sundays, holidays or days after the last one", () => {
    for (const d of days) if (d.weekday === 0) expect(d.worked).toBe(false);
    expect(days.find((d) => d.date === "2026-08-15")?.worked).toBe(false);
    expect(days.filter((d) => d.date > "2026-10-31").every((d) => !d.worked)).toBe(true);
  });

  it("keeps headcount within the roster, and approves only days with a report", () => {
    for (const d of days) {
      expect(d.present).toBeGreaterThanOrEqual(0);
      expect(d.present).toBeLessThanOrEqual(SAMPLE_ROSTER);
      if (d.approved) expect(d.reportFiled).toBe(true);
      if (!d.worked) expect(d.present).toBe(0);
    }
  });

  it("levels a day by share of the roster present", () => {
    const base = { date: "2026-10-01", weekday: 4, worked: true, reportFiled: true, approved: true };
    expect(levelOf({ ...base, worked: false, present: 0 })).toBe(0);
    expect(levelOf({ ...base, present: 42 })).toBe(4);
    expect(levelOf({ ...base, present: 38 })).toBe(3);
    expect(levelOf({ ...base, present: 34 })).toBe(2);
    expect(levelOf({ ...base, present: 30 })).toBe(1);
    expect(levelOf({ ...base, present: 10 })).toBe(1);
  });

  it("counts the longest run of reports over working days only", () => {
    const mk = (date: string, worked: boolean, reportFiled: boolean) => ({ date, weekday: 1, worked, present: worked ? 40 : 0, reportFiled, approved: false });
    const stats = seasonStats([mk("a", true, true), mk("b", false, false), mk("c", true, true), mk("d", true, false), mk("e", true, true)]);
    expect(stats.longestReportRun).toBe(2);
    expect(stats.workedDays).toBe(4);
    expect(stats.averagePresent).toBe(40);
  });

  it("describes a day in plain words", () => {
    expect(shortDate("2026-08-14")).toBe("Fri 14 Aug");
    const d = { date: "2026-08-14", weekday: 5, worked: true, present: 39, reportFiled: true, approved: false };
    expect(describeDay(d)).toBe("Fri 14 Aug · 39 of 42 present · report filed · not approved");
    expect(describeDay({ ...d, worked: false, present: 0 })).toBe("Fri 14 Aug · no work planned");
  });

  it("labels each month once", () => {
    const labels = monthLabels(days).map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBeGreaterThanOrEqual(6);
  });
});

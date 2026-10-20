import { describe, expect, it } from "vitest";
import { cleanAdjustmentInput, cleanPeriodInput, cleanReason, wageErrorCode } from "./input";

describe("cleanPeriodInput", () => {
  it("makes a week of seven days from the date given", () => {
    expect(cleanPeriodInput({ type: "week", start: "2026-10-12" })).toEqual({
      ok: true,
      value: { period_type: "week", start_date: "2026-10-12", end_date: "2026-10-18" }
    });
  });

  it("carries a week across a month and a year end", () => {
    const r = cleanPeriodInput({ type: "week", start: "2026-12-29" });
    expect(r.ok && r.value.end_date).toBe("2027-01-04");
  });

  it("makes the whole calendar month from any date in it", () => {
    expect(cleanPeriodInput({ type: "month", start: "2026-10-19" })).toEqual({
      ok: true,
      value: { period_type: "month", start_date: "2026-10-01", end_date: "2026-10-31" }
    });
  });

  it("knows leap February", () => {
    const r = cleanPeriodInput({ type: "month", start: "2028-02-10" });
    expect(r.ok && r.value.end_date).toBe("2028-02-29");
    const s = cleanPeriodInput({ type: "month", start: "2027-02-10" });
    expect(s.ok && s.value.end_date).toBe("2027-02-28");
  });

  it("refuses an unknown type and a bad date", () => {
    for (const raw of [
      { type: "fortnight", start: "2026-10-12" },
      { type: "week", start: "2026-02-31" },
      { type: "week", start: "12/10/2026" },
      { type: "week", start: "" },
      { type: "week", start: null },
      { type: null, start: "2026-10-12" }
    ]) {
      expect(cleanPeriodInput(raw)).toEqual({ ok: false, code: "wage_period_invalid" });
    }
  });
});

describe("cleanAdjustmentInput", () => {
  it("accepts a positive and a negative amount with a reason", () => {
    expect(cleanAdjustmentInput({ amount: "800", reason: " Paid leave 12 Oct " })).toEqual({
      ok: true,
      value: { amount: 800, reason: "Paid leave 12 Oct" }
    });
    expect(cleanAdjustmentInput({ amount: "-200.50", reason: "Advance recovered" })).toEqual({
      ok: true,
      value: { amount: -200.5, reason: "Advance recovered" }
    });
  });

  it("refuses zero, more than two decimals and anything that is not plain digits", () => {
    for (const amount of ["0", "0.00", "-0", "1.234", "1e3", "0x10", "Infinity", "", " ", "12 000", null]) {
      expect(cleanAdjustmentInput({ amount, reason: "x" }), String(amount)).toEqual({ ok: false, code: "wage_amount" });
    }
  });

  it("refuses a blank or over-long reason", () => {
    expect(cleanAdjustmentInput({ amount: "5", reason: "   " })).toEqual({ ok: false, code: "wage_reason" });
    expect(cleanAdjustmentInput({ amount: "5", reason: "x".repeat(501) })).toEqual({ ok: false, code: "wage_reason" });
    expect(cleanAdjustmentInput({ amount: "5", reason: "x".repeat(500) }).ok).toBe(true);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(cleanAdjustmentInput({ amount: "5", reason: "😀".repeat(500) }).ok).toBe(true);
  });
});

describe("cleanReason", () => {
  it("trims, and refuses blank and over-long", () => {
    expect(cleanReason("  Fix  ")).toBe("Fix");
    expect(cleanReason("   ")).toBeNull();
    expect(cleanReason("x".repeat(501))).toBeNull();
    expect(cleanReason(undefined)).toBeNull();
  });
});

describe("wageErrorCode", () => {
  it("maps the SQLSTATEs the wage functions raise", () => {
    expect(wageErrorCode("42501")).toBe("wage_forbidden");
    expect(wageErrorCode("23P01")).toBe("wage_overlap");
    expect(wageErrorCode("55000")).toBe("wage_state");
    expect(wageErrorCode("22023")).toBe("wage_reason");
    expect(wageErrorCode("23503")).toBe("wage_no_line");
    expect(wageErrorCode("XX000")).toBe("generic");
    expect(wageErrorCode(undefined)).toBe("generic");
  });
});

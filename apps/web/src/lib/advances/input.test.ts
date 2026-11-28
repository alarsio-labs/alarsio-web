import { describe, expect, it } from "vitest";
import { advanceErrorCode, cleanAdvanceInput } from "./input";

const NOW = new Date("2026-11-28T10:00:00Z");
const ok = { amount: "500", paidOn: "2026-11-28", note: "" };

describe("cleanAdvanceInput", () => {
  it("turns rupees into paise and a blank note into null", () => {
    expect(cleanAdvanceInput(ok, NOW)).toEqual({ ok: true, value: { amountPaise: 50000, paidOn: "2026-11-28", note: null } });
  });

  it.each([
    ["500.5", 50050],
    ["500.05", 50005],
    ["0.01", 1],
    ["1000000", 100_000_000],
  ])("reads %s rupees as %i paise", (amount, paise) => {
    const r = cleanAdvanceInput({ ...ok, amount }, NOW);
    expect(r.ok && r.value.amountPaise).toBe(paise);
  });

  it.each(["", "0", "0.00", "-5", "1e3", "0x10", "Infinity", "5.123", "1000000.01", "12345678", " ", "5,000"])(
    "refuses the amount %j",
    (amount) => {
      expect(cleanAdvanceInput({ ...ok, amount }, NOW)).toEqual({ ok: false, code: "advance_amount" });
    },
  );

  it("refuses a missing amount", () => {
    expect(cleanAdvanceInput({ ...ok, amount: null }, NOW)).toEqual({ ok: false, code: "advance_amount" });
  });

  it("allows today and tomorrow, and refuses the day after", () => {
    expect(cleanAdvanceInput({ ...ok, paidOn: "2026-11-29" }, NOW).ok).toBe(true);
    expect(cleanAdvanceInput({ ...ok, paidOn: "2026-11-30" }, NOW)).toEqual({ ok: false, code: "advance_date" });
  });

  it.each(["", "28-11-2026", "2026-02-30", "2026-13-01", "not a date"])("refuses the date %j", (paidOn) => {
    expect(cleanAdvanceInput({ ...ok, paidOn }, NOW)).toEqual({ ok: false, code: "advance_date" });
  });

  it("trims the note and keeps 500 characters", () => {
    const r = cleanAdvanceInput({ ...ok, note: `  ${"a".repeat(500)}  ` }, NOW);
    expect(r.ok && r.value.note).toBe("a".repeat(500));
  });

  it("refuses a note over 500 characters, counting characters not code units", () => {
    expect(cleanAdvanceInput({ ...ok, note: "a".repeat(501) }, NOW)).toEqual({ ok: false, code: "advance_note" });
    expect(cleanAdvanceInput({ ...ok, note: "😀".repeat(500) }, NOW).ok).toBe(true);
  });

  it("refuses a note that is not text", () => {
    expect(cleanAdvanceInput({ ...ok, note: 5 }, NOW)).toEqual({ ok: false, code: "advance_note" });
  });
});

describe("advanceErrorCode", () => {
  it.each([
    ["42501", "advance_forbidden"],
    ["22023", "advance_date"],
    ["23514", "advance_rule"],
    ["23505", "advance_exists"],
    ["XX000", "generic"],
    [undefined, "generic"],
  ])("maps %s to %s", (state, code) => {
    expect(advanceErrorCode(state)).toBe(code);
  });
});

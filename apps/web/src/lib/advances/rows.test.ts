import { describe, expect, it } from "vitest";
import { formatRupees, toAdvanceRow, toRosterRow, toTotalRow } from "./rows";

const advance = { id: "a", worker_id: "w", paid_on: "2026-11-20", amount_paise: 50000, note: null, reverses_id: null };

describe("row guards", () => {
  it("accepts a good advance and drops extra fields", () => {
    expect(toAdvanceRow({ ...advance, org_id: "x" })).toEqual(advance);
  });

  it.each([
    ["a string amount", { ...advance, amount_paise: "50000" }],
    ["a fractional amount", { ...advance, amount_paise: 1.5 }],
    ["a missing worker", { ...advance, worker_id: undefined }],
    ["a numeric note", { ...advance, note: 5 }],
    ["not an object", null],
  ])("drops %s", (_name, row) => {
    expect(toAdvanceRow(row)).toBeNull();
  });

  it("guards roster and total rows", () => {
    expect(toRosterRow({ worker_id: "w", name: "Ravi", unassigned_at: null })).toEqual({ worker_id: "w", name: "Ravi", unassigned_at: null });
    expect(toRosterRow({ worker_id: "w", name: 3, unassigned_at: null })).toBeNull();
    expect(toTotalRow({ worker_id: "w", total_paise: -100 })).toEqual({ worker_id: "w", total_paise: -100 });
    expect(toTotalRow({ worker_id: "w", total_paise: "5" })).toBeNull();
  });
});

describe("formatRupees", () => {
  it.each([
    [50000, "₹500"],
    [50050, "₹500.50"],
    [100_000_000, "₹10,00,000"],
    [0, "₹0"],
  ])("shows %i paise as %s", (paise, text) => {
    expect(formatRupees(paise)).toBe(text);
  });

  it("shows a negative amount with a minus", () => {
    expect(formatRupees(-50000)).toMatch(/^-₹500$/);
  });
});

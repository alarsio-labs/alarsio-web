import { describe, expect, it } from "vitest";
import { formatQty, isAlertRow, isBalanceRow } from "./stock";

const ID = "a1000000-0000-4000-8000-000000000001";
const SITE = "51000000-0000-4000-8000-000000000001";

describe("formatQty", () => {
  it("shows up to three decimals and groups in the Indian style", () => {
    expect(formatQty(27.5)).toBe("27.5");
    expect(formatQty(0.001)).toBe("0.001");
    expect(formatQty(-12.345)).toBe("-12.345");
    expect(formatQty(1234567.5)).toBe("12,34,567.5");
    expect(formatQty(0)).toBe("0");
  });
});

describe("row guards", () => {
  const balance = {
    material_id: ID,
    site_id: SITE,
    name: "Cement",
    unit: "bag",
    low_stock_threshold: 10,
    balance: 27.5,
    transaction_count: 2,
    last_movement_on: "2026-10-20",
  };

  it("accepts a balance row, and numerics that arrive as strings", () => {
    expect(isBalanceRow(balance)).toBe(true);
    expect(isBalanceRow({ ...balance, balance: "27.500", low_stock_threshold: "10.000", transaction_count: 2 })).toBe(true);
    expect(isBalanceRow({ ...balance, low_stock_threshold: null, last_movement_on: null })).toBe(true);
  });

  it("refuses a row that is missing a field or has one of the wrong type", () => {
    expect(isBalanceRow({ ...balance, name: 5 })).toBe(false);
    expect(isBalanceRow({ ...balance, balance: "lots" })).toBe(false);
    expect(isBalanceRow({ ...balance, balance: null })).toBe(false);
    expect(isBalanceRow(null)).toBe(false);
    expect(isBalanceRow("row")).toBe(false);
  });

  it("accepts an alert row with a known alert, and refuses an unknown one", () => {
    const alert = { material_id: ID, site_id: SITE, name: "Cement", unit: "bag", balance: -3, low_stock_threshold: null, alert: "negative" };
    expect(isAlertRow(alert)).toBe(true);
    expect(isAlertRow({ ...alert, alert: "low" })).toBe(true);
    expect(isAlertRow({ ...alert, alert: "fire" })).toBe(false);
  });
});

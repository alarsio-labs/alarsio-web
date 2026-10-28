import { describe, expect, it } from "vitest";
import { formText, parseDate, parseRate, rateDateWindow, workerErrorCode, workerFields } from "./form";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("formText", () => {
  it("trims, and gives an empty string when absent", () => {
    expect(formText(fd({ a: "  x " }), "a", 5)).toBe("x");
    expect(formText(fd({}), "a", 5)).toBe("");
  });

  it("refuses over-long input instead of cutting it short", () => {
    expect(formText(fd({ a: "x".repeat(41) }), "a", 40)).toBeNull();
  });
});

describe("workerFields", () => {
  const ok = { full_name: "Ravi", trade: "mason", pay_type: "Daily", phone: "" };

  it("reads a valid worker, lowercasing pay type and nulling a blank phone", () => {
    expect(workerFields(fd(ok))).toEqual({ full_name: "Ravi", trade: "mason", pay_type: "daily", phone: null });
  });

  it("refuses a missing name, a pay type outside the list, and a phone over 20", () => {
    expect(workerFields(fd({ ...ok, full_name: "" }))).toBeNull();
    expect(workerFields(fd({ ...ok, pay_type: "monthly" }))).toBeNull();
    expect(workerFields(fd({ ...ok, phone: "1".repeat(21) }))).toBeNull();
  });
});

describe("parseRate", () => {
  it("accepts rupees with up to two decimals, up to ₹1,00,000", () => {
    expect(parseRate("650")).toBe(650);
    expect(parseRate("650.75")).toBe(650.75);
    expect(parseRate("100000")).toBe(100000);
  });

  it("refuses zero, over the ceiling, three decimals and junk", () => {
    for (const bad of ["0", "0.00", "-5", "100000.01", "9999999999.99", "1.234", "", "abc", "1e3", " 5"]) {
      expect(parseRate(bad)).toBeNull();
    }
  });
});

describe("parseDate", () => {
  const w = rateDateWindow("2026-10-19");

  it("builds a window 60 days back and a year ahead", () => {
    expect(w).toEqual({ min: "2026-08-20", max: "2027-10-19" });
  });

  it("accepts a real date inside the window", () => {
    expect(parseDate("2026-10-19", w)).toBe("2026-10-19");
    expect(parseDate("2026-08-20", w)).toBe("2026-08-20");
    expect(parseDate("2028-02-29")).toBe("2028-02-29");
  });

  it("refuses an impossible date, another format, or a date outside the window", () => {
    for (const bad of ["2026-02-30", "18-10-2026", "2026-1-5", ""]) expect(parseDate(bad)).toBeNull();
    expect(parseDate("2026-08-19", w)).toBeNull();
    expect(parseDate("1900-01-01", w)).toBeNull();
    expect(parseDate("2027-10-20", w)).toBeNull();
  });
});

describe("workerErrorCode", () => {
  it("maps database errors to fixed message codes", () => {
    expect(workerErrorCode("23505")).toBe("worker_code_taken");
    expect(workerErrorCode("23514")).toBe("worker_invalid");
    expect(workerErrorCode("42501")).toBe("not_permitted");
    expect(workerErrorCode("55000")).toBe("pay_type_locked");
    expect(workerErrorCode(undefined)).toBe("generic");
  });
});

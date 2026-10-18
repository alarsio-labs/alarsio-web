import { describe, expect, it } from "vitest";
import { parseDate, parseRate, workerErrorCode } from "./form";

describe("parseRate", () => {
  it("accepts rupees with up to two decimals", () => {
    expect(parseRate("650")).toBe(650);
    expect(parseRate("650.5")).toBe(650.5);
    expect(parseRate("650.75")).toBe(650.75);
  });

  it("refuses zero, negatives, three decimals and junk", () => {
    for (const bad of ["0", "0.00", "-5", "1.234", "", "abc", "1e3", " 5"]) expect(parseRate(bad)).toBeNull();
  });
});

describe("parseDate", () => {
  it("accepts a real calendar date", () => {
    expect(parseDate("2026-10-18")).toBe("2026-10-18");
    expect(parseDate("2028-02-29")).toBe("2028-02-29");
  });

  it("refuses an impossible date or another format", () => {
    for (const bad of ["2026-02-30", "2027-02-29", "18-10-2026", "2026-1-5", ""]) expect(parseDate(bad)).toBeNull();
  });
});

describe("workerErrorCode", () => {
  it("maps database errors to fixed message codes", () => {
    expect(workerErrorCode("23505")).toBe("worker_code_taken");
    expect(workerErrorCode("23514")).toBe("worker_invalid");
    expect(workerErrorCode("42501")).toBe("not_permitted");
    expect(workerErrorCode(undefined)).toBe("generic");
  });
});

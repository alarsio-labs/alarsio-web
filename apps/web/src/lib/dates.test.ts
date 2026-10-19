import { describe, expect, it } from "vitest";
import { formatDay, formatInstant, todayInIndia } from "./dates";

describe("dates", () => {
  it("shows a date-only value as the same calendar day", () => {
    expect(formatDay("2026-10-18")).toBe("18 Oct 2026");
  });

  it("shows an early-morning India timestamp on the India day, not the UTC one", () => {
    // 02:00 IST on 18 Oct is 20:30 UTC on 17 Oct.
    expect(formatInstant("2026-10-17T20:30:00Z")).toBe("18 Oct 2026");
  });

  it("gives today's date in India", () => {
    expect(todayInIndia(new Date("2026-10-17T20:30:00Z"))).toBe("2026-10-18");
  });
});

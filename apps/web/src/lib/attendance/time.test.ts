import { describe, expect, it } from "vitest";
import { istStamp, istToday } from "./time";

describe("istToday", () => {
  it("is the Asia/Kolkata calendar date, which runs ahead of UTC", () => {
    expect(istToday(new Date("2026-10-20T10:00:00Z"))).toBe("2026-10-20");
    expect(istToday(new Date("2026-10-20T18:29:59Z"))).toBe("2026-10-20");
    expect(istToday(new Date("2026-10-20T18:30:00Z"))).toBe("2026-10-21");
  });
  it("rolls over the year in Kolkata time", () => {
    expect(istToday(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
  });
});

describe("istStamp", () => {
  it("shows the Kolkata date and time and says IST", () => {
    const s = istStamp("2026-10-20T18:31:00Z");
    expect(s).toMatch(/21 Oct 2026/);
    expect(s).toMatch(/12:01/);
    expect(s.endsWith(" IST")).toBe(true);
  });
});

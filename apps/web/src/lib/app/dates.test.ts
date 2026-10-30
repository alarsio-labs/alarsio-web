import { describe, expect, it } from "vitest";
import { dayLabel, eyebrowFor } from "./dates";

describe("dayLabel", () => {
  it("names the weekday, the day and the month", () => {
    expect(dayLabel("2026-10-30")).toBe("Fri 30 Oct");
    expect(dayLabel("2026-01-01")).toBe("Thu 1 Jan");
  });

  it("leaves anything that is not a date alone", () => {
    expect(dayLabel("soon")).toBe("soon");
  });
});

describe("eyebrowFor", () => {
  it("adds the timezone the pages' days are in", () => {
    expect(eyebrowFor("2026-10-30")).toBe("Fri 30 Oct · Asia/Kolkata");
    expect(eyebrowFor("")).toBe("Asia/Kolkata");
  });
});

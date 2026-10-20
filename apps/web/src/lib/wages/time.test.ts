import { describe, expect, it } from "vitest";
import { formatIst } from "./time";

describe("formatIst", () => {
  it("shows the Asia/Kolkata time, five and a half hours ahead of UTC", () => {
    expect(formatIst("2026-10-20T10:12:00Z")).toBe("20 Oct 2026, 3:42 pm");
  });

  it("crosses midnight into the next Indian day", () => {
    expect(formatIst("2026-10-20T19:00:00Z")).toBe("21 Oct 2026, 12:30 am");
  });

  it("returns null for something that is not a timestamp", () => {
    expect(formatIst("not a date")).toBeNull();
  });
});

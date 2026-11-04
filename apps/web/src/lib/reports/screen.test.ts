import { describe, expect, it } from "vitest";
import { reportTag } from "./screen";

describe("reportTag", () => {
  it("asks for a review of a filed report, in red-deep", () => {
    expect(reportTag("submitted")).toEqual({ word: "Waiting for a review", tone: "action" });
  });

  it("shows a rejected report as sent back, in red-deep", () => {
    expect(reportTag("rejected")).toEqual({ word: "Sent back", tone: "action" });
  });

  it("settles a reviewed report in ink", () => {
    expect(reportTag("reviewed")).toEqual({ word: "Reviewed", tone: "ink" });
  });
});

import { describe, expect, it } from "vitest";
import { siteTag } from "./screen";

describe("siteTag", () => {
  it("shows running and finished sites in ink", () => {
    expect(siteTag("active")).toEqual({ word: "Active", tone: "ink" });
    expect(siteTag("completed")).toEqual({ word: "Completed", tone: "ink" });
  });

  it("mutes sites that are not running, and never marks a site red-deep", () => {
    for (const s of ["planned", "paused", "archived"] as const) expect(siteTag(s).tone).toBe("muted");
  });
});

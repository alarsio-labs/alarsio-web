import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
    expect(safeNextPath("/dashboard?x=1")).toBe("/dashboard?x=1");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "evil", "/a\\b", "/a\nb", "", null, 7]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });

  it("refuses an absurdly long value", () => {
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/dashboard");
  });
});

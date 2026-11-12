import { describe, expect, it } from "vitest";
import { NAME_MAX, PLACEHOLDER_NAME, parseDisplayName, shownName } from "./profile-name";

// Pre-launch audit issue 6: negative cases first.
describe("parseDisplayName", () => {
  it("refuses an empty, blank or missing name", () => {
    for (const raw of ["", "   ", "\t\n", undefined, null, 42]) expect(parseDisplayName(raw)).toEqual({ ok: false, code: "name_empty" });
  });

  it("refuses a name over the database's 120 characters, after trimming", () => {
    expect(parseDisplayName("x".repeat(NAME_MAX + 1))).toEqual({ ok: false, code: "name_long" });
    expect(parseDisplayName(`  ${"x".repeat(NAME_MAX)}  `)).toEqual({ ok: true, name: "x".repeat(NAME_MAX) });
  });

  it("trims the ends and folds runs of spaces into one", () => {
    expect(parseDisplayName("  Ramesh   Kumar ")).toEqual({ ok: true, name: "Ramesh Kumar" });
    expect(parseDisplayName("Sunita\tDevi")).toEqual({ ok: true, name: "Sunita Devi" });
  });
});

describe("shownName", () => {
  it("hides the placeholder and empty names", () => {
    expect(shownName(PLACEHOLDER_NAME)).toBeNull();
    expect(shownName("  ")).toBeNull();
    expect(shownName(null)).toBeNull();
    expect(shownName(undefined)).toBeNull();
  });

  it("shows a real name, trimmed", () => {
    expect(shownName(" Priya Shah ")).toBe("Priya Shah");
  });
});

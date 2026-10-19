import { describe, expect, it } from "vitest";
import { cleanMaterialInput, materialErrorCode } from "./input";

describe("cleanMaterialInput", () => {
  const ok = (name: unknown, unit: unknown, threshold: unknown) => cleanMaterialInput({ name, unit, threshold }, { unit: true });

  it("trims the name, keeps the unit, and reads the threshold as a number", () => {
    expect(ok("  Cement  ", "bag", "50")).toEqual({ ok: true, value: { name: "Cement", unit: "bag", threshold: 50 } });
    expect(ok("Sand", "cum", "12.5")).toEqual({ ok: true, value: { name: "Sand", unit: "cum", threshold: 12.5 } });
  });

  it("treats a missing or blank threshold as no alert, not as zero", () => {
    expect(ok("Sand", "cum", "")).toMatchObject({ ok: true, value: { threshold: null } });
    expect(ok("Sand", "cum", "   ")).toMatchObject({ ok: true, value: { threshold: null } });
    expect(ok("Sand", "cum", null)).toMatchObject({ ok: true, value: { threshold: null } });
    expect(ok("Sand", "cum", "0")).toMatchObject({ ok: true, value: { threshold: 0 } });
  });

  it("refuses a name that is blank or longer than 120 characters, counting characters not bytes", () => {
    expect(ok("", "bag", "")).toEqual({ ok: false, code: "material_name" });
    expect(ok("   ", "bag", "")).toEqual({ ok: false, code: "material_name" });
    expect(ok("x".repeat(121), "bag", "")).toEqual({ ok: false, code: "material_name" });
    expect(ok("x".repeat(120), "bag", "")).toMatchObject({ ok: true });
    // 120 characters that are each two UTF-16 units: still within the database's char_length.
    expect(ok("\u{1F9F1}".repeat(120), "bag", "")).toMatchObject({ ok: true });
    expect(ok(7, "bag", "")).toEqual({ ok: false, code: "material_name" });
  });

  it("refuses a unit outside the fixed list", () => {
    for (const unit of ["Bag", "tons", "", null, undefined]) {
      expect(ok("Cement", unit, "")).toEqual({ ok: false, code: "material_unit" });
    }
  });

  it("refuses a threshold that is negative, not a number, too precise or too large for numeric(12,3)", () => {
    for (const t of ["-1", "abc", "1,5", "1.2345", "1e3", "NaN", "Infinity", "1000000000", "0x10", "5 bags"]) {
      expect(ok("Cement", "bag", t)).toEqual({ ok: false, code: "material_threshold" });
    }
    expect(ok("Cement", "bag", "999999999.999")).toMatchObject({ ok: true, value: { threshold: 999999999.999 } });
  });

  it("leaves the unit out when only the name and threshold may change", () => {
    expect(cleanMaterialInput({ name: "Cement", unit: "kg", threshold: "5" }, { unit: false })).toEqual({
      ok: true,
      value: { name: "Cement", threshold: 5 },
    });
    // A unit sent with an edit is not even looked at, so a bad one cannot fail it.
    expect(cleanMaterialInput({ name: "Cement", unit: "junk", threshold: "" }, { unit: false })).toMatchObject({ ok: true });
  });
});

describe("materialErrorCode", () => {
  it("says who may change materials, and when a name is taken", () => {
    expect(materialErrorCode("42501")).toBe("material_forbidden");
    expect(materialErrorCode("23505")).toBe("material_exists");
  });

  it("is generic for anything else, and for no code at all", () => {
    for (const code of ["XX000", "23514", "22003", "", undefined]) expect(materialErrorCode(code)).toBe("generic");
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MATERIAL_UNITS, isMaterialUnit, unitLabel } from "./units";

// The list is written twice: here for the form, and in the CHECK on
// materials.unit for the database. If they drift, a manager picks a unit the
// database refuses, or cannot pick one it allows. This reads the migration so
// the two cannot disagree without a failing test.
function unitsInMigration(): string[] {
  const dir = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));
  const file = readdirSync(dir).find((f) => readFileSync(dir + f, "utf8").includes("create table public.materials ("));
  if (!file) throw new Error("the materials migration was not found");
  const sql = readFileSync(dir + file, "utf8");
  const match = /unit\s+text not null\s+check \(unit in \(([^)]*)\)\)/.exec(sql);
  if (!match?.[1]) throw new Error("the unit CHECK was not found in the migration");
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe("material units (ADR-015)", () => {
  it("is exactly the list in the database CHECK, in any order", () => {
    expect([...MATERIAL_UNITS].sort()).toEqual(unitsInMigration().sort());
  });

  it("accepts a listed unit and nothing else", () => {
    expect(isMaterialUnit("bag")).toBe(true);
    for (const bad of ["Bag", "BAG", "bags", "", " bag", "ton", null, undefined, 3]) {
      expect(isMaterialUnit(bad)).toBe(false);
    }
  });

  it("has a label for every unit, and the code is still shown", () => {
    for (const unit of MATERIAL_UNITS) expect(unitLabel(unit)).toContain(unit);
    expect(unitLabel("cum")).toBe("Cubic metres (cum)");
  });
});

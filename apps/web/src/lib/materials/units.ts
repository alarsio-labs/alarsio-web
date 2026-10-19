// The fixed list of units a material can have (ADR-015). It is the same list as
// the CHECK on materials.unit, and a test reads the migration to keep the two
// equal. A unit is fixed once the material exists: changing bags to kg would
// silently change what every earlier ledger row means, so a wrong unit means a
// new material.
const LABELS = {
  nos: "Numbers",
  bag: "Bags",
  kg: "Kilograms",
  tonne: "Tonnes",
  litre: "Litres",
  cft: "Cubic feet",
  cum: "Cubic metres",
  sqft: "Square feet",
  sqm: "Square metres",
  rft: "Running feet",
  m: "Metres",
  brass: "Brass",
  trip: "Trips",
} as const;

export type MaterialUnit = keyof typeof LABELS;

export const MATERIAL_UNITS = Object.keys(LABELS) as MaterialUnit[];

export function isMaterialUnit(value: unknown): value is MaterialUnit {
  return typeof value === "string" && Object.hasOwn(LABELS, value);
}

/** For a menu: the plain name, with the code a manager will see elsewhere. */
export function unitLabel(unit: MaterialUnit): string {
  return `${LABELS[unit]} (${unit})`;
}

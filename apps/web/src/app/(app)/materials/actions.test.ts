import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  inserts: [] as { table: string; values: unknown }[],
  updates: [] as { table: string; values: unknown; column: string; value: unknown }[],
  insertResult: { error: null } as { error: { code?: string } | null },
  updateResult: { data: [{ id: "x" }], error: null } as { data: unknown; error: { code?: string } | null },
  revalidated: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => db.revalidated.push(p) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    from: (table: string) => ({
      insert: async (values: unknown) => {
        db.inserts.push({ table, values });
        return db.insertResult;
      },
      update: (values: unknown) => ({
        eq: (column: string, value: unknown) => ({
          select: async () => {
            db.updates.push({ table, values, column, value });
            return db.updateResult;
          },
        }),
      }),
    }),
  }),
}));

const { createMaterial, updateMaterial } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const SITE = "51000000-0000-4000-8000-000000000001";
const MATERIAL = "a1000000-0000-4000-8000-000000000001";
const BACK = `/materials?org=${ORG}&site=${SITE}`;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const created = (over: Record<string, string> = {}) =>
  form({ org_id: ORG, site_id: SITE, name: "Cement", unit: "bag", threshold: "50", ...over });
const edited = (over: Record<string, string> = {}) =>
  form({ org_id: ORG, site_id: SITE, material_id: MATERIAL, name: "Cement 53", threshold: "40", ...over });

/** What the action redirected to: every path out of an action is a redirect. */
async function target(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const m = /^REDIRECT (.*)$/.exec(error instanceof Error ? error.message : "");
    if (m?.[1]) return m[1];
    throw error;
  }
  throw new Error("the action did not redirect");
}

beforeEach(() => {
  db.inserts.length = 0;
  db.updates.length = 0;
  db.revalidated.length = 0;
  db.insertResult = { error: null };
  db.updateResult = { data: [{ id: "x" }], error: null };
});

describe("createMaterial", () => {
  it("sends a bad organisation or site to the dashboard without touching the database", async () => {
    expect(await target(() => createMaterial(created({ org_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => createMaterial(created({ site_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => createMaterial(form({ name: "Cement", unit: "bag" })))).toBe("/dashboard");
    expect(db.inserts).toEqual([]);
  });

  it("says what is wrong with the input and writes nothing", async () => {
    expect(await target(() => createMaterial(created({ name: "  " })))).toBe(`${BACK}&error=material_name`);
    expect(await target(() => createMaterial(created({ name: "x".repeat(121) })))).toBe(`${BACK}&error=material_name`);
    expect(await target(() => createMaterial(created({ unit: "tons" })))).toBe(`${BACK}&error=material_unit`);
    expect(await target(() => createMaterial(created({ threshold: "-1" })))).toBe(`${BACK}&error=material_threshold`);
    expect(await target(() => createMaterial(created({ threshold: "1.2345" })))).toBe(`${BACK}&error=material_threshold`);
    expect(db.inserts).toEqual([]);
  });

  it("inserts exactly the five columns a client may set, with the name trimmed", async () => {
    expect(await target(() => createMaterial(created({ name: "  Cement  " })))).toBe(`${BACK}&saved=1`);

    expect(db.inserts).toEqual([
      { table: "materials", values: { org_id: ORG, site_id: SITE, name: "Cement", unit: "bag", low_stock_threshold: 50 } },
    ]);
    expect(db.revalidated).toEqual(["/materials"]);
  });

  it("never passes along a column the form was not meant to carry", async () => {
    const f = created({ id: MATERIAL, created_by: "someone", updated_at: "2020-01-01", status: "x" });
    await target(() => createMaterial(f));

    expect(Object.keys(db.inserts[0]!.values as object).sort()).toEqual(["low_stock_threshold", "name", "org_id", "site_id", "unit"]);
  });

  it("stores no alert (null) for a blank threshold", async () => {
    await target(() => createMaterial(created({ threshold: "" })));
    expect(db.inserts[0]!.values).toMatchObject({ low_stock_threshold: null });
  });

  it("says who may create, and when the name is taken, and nothing else about the database", async () => {
    db.insertResult = { error: { code: "42501" } };
    expect(await target(() => createMaterial(created()))).toBe(`${BACK}&error=material_forbidden`);
    db.insertResult = { error: { code: "23505" } };
    expect(await target(() => createMaterial(created()))).toBe(`${BACK}&error=material_exists`);
    db.insertResult = { error: { code: "XX000" } };
    expect(await target(() => createMaterial(created()))).toBe(`${BACK}&error=generic`);
    expect(db.revalidated).toEqual([]);
  });
});

describe("updateMaterial", () => {
  it("sends a bad id to the dashboard without touching the database", async () => {
    const bad: Record<string, string>[] = [{ org_id: "nope" }, { site_id: "nope" }, { material_id: "nope" }];
    for (const over of bad) {
      expect(await target(() => updateMaterial(edited(over)))).toBe("/dashboard");
    }
    expect(db.updates).toEqual([]);
  });

  it("says what is wrong with the input and writes nothing", async () => {
    expect(await target(() => updateMaterial(edited({ name: "" })))).toBe(`${BACK}&error=material_name`);
    expect(await target(() => updateMaterial(edited({ threshold: "abc" })))).toBe(`${BACK}&error=material_threshold`);
    expect(db.updates).toEqual([]);
  });

  it("changes only the name and the threshold, on the one material", async () => {
    expect(await target(() => updateMaterial(edited()))).toBe(`${BACK}&saved=1`);

    expect(db.updates).toEqual([
      { table: "materials", values: { name: "Cement 53", low_stock_threshold: 40 }, column: "id", value: MATERIAL },
    ]);
    expect(db.revalidated).toEqual(["/materials"]);
  });

  it("never sends a unit, a site or an organisation, even if the form carries one (ADR-015)", async () => {
    await target(() => updateMaterial(edited({ unit: "kg", site_id_new: SITE, org_id_new: ORG })));
    expect(Object.keys(db.updates[0]!.values as object).sort()).toEqual(["low_stock_threshold", "name"]);
    // A bad unit in the form does not fail an edit either: it is not read.
    expect(await target(() => updateMaterial(edited({ unit: "junk" })))).toBe(`${BACK}&saved=1`);
  });

  it("says so when nothing was changed, which is what RLS does to a row the caller cannot edit", async () => {
    db.updateResult = { data: [], error: null };
    expect(await target(() => updateMaterial(edited()))).toBe(`${BACK}&error=material_not_found`);
    db.updateResult = { data: null, error: null };
    expect(await target(() => updateMaterial(edited()))).toBe(`${BACK}&error=material_not_found`);
    expect(db.revalidated).toEqual([]);
  });

  it("says who may edit, and when the name is taken", async () => {
    db.updateResult = { data: null, error: { code: "42501" } };
    expect(await target(() => updateMaterial(edited()))).toBe(`${BACK}&error=material_forbidden`);
    db.updateResult = { data: null, error: { code: "23505" } };
    expect(await target(() => updateMaterial(edited()))).toBe(`${BACK}&error=material_exists`);
    db.updateResult = { data: null, error: { code: "XX000" } };
    expect(await target(() => updateMaterial(edited()))).toBe(`${BACK}&error=generic`);
  });
});

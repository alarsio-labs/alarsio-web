import { beforeEach, describe, expect, it, vi } from "vitest";

type Err = { code?: string } | null;

const db = vi.hoisted(() => ({
  inserts: [] as { table: string; values: unknown }[],
  updates: [] as { table: string; values: unknown; filters: [string, unknown][] }[],
  rpcs: [] as { name: string; args: unknown }[],
  insertResult: { error: null } as { error: Err },
  updateResult: { data: [{ id: "x" }], error: null } as { data: unknown; error: Err },
  rpcResult: { data: null, error: null } as { data: unknown; error: Err },
  revalidated: [] as string[]
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => db.revalidated.push(p) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    from: (table: string) => ({
      // An awaited insert is the whole call. If the action chained .select()
      // onto it (ADR-034 W3), this object has no such method and the test fails.
      insert: async (values: unknown) => {
        db.inserts.push({ table, values });
        return db.insertResult;
      },
      update: (values: unknown) => {
        const filters: [string, unknown][] = [];
        const chain = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          select: async () => {
            db.updates.push({ table, values, filters });
            return db.updateResult;
          }
        };
        return chain;
      }
    }),
    rpc: async (name: string, args: unknown) => {
      db.rpcs.push({ name, args });
      return db.rpcResult;
    }
  })
}));

const { createSite, updateSite, setSiteStatus, archiveSite, assignSupervisor, removeSupervisor } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const SITE = "51000000-0000-4000-8000-000000000001";
const LIST = `/sites?org=${ORG}`;
const NEW = `/sites/new?org=${ORG}`;
const PAGE = `/sites/${SITE}?org=${ORG}`;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const details = (over: Record<string, string> = {}) => ({
  name: "Tower A",
  address: "12 MG Road, Pune",
  latitude: "18.5204",
  longitude: "73.8567",
  radius: "200",
  ...over
});
const created = (over: Record<string, string> = {}) => form({ org_id: ORG, ...details(over) });
const edited = (over: Record<string, string> = {}) => form({ org_id: ORG, site_id: SITE, ...details(over) });

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

const nothingWritten = () => {
  expect(db.inserts).toEqual([]);
  expect(db.updates).toEqual([]);
  expect(db.rpcs).toEqual([]);
};

beforeEach(() => {
  db.inserts.length = 0;
  db.updates.length = 0;
  db.rpcs.length = 0;
  db.revalidated.length = 0;
  db.insertResult = { error: null };
  db.updateResult = { data: [{ id: "x" }], error: null };
  db.rpcResult = { data: null, error: null };
});

describe("createSite", () => {
  it("sends a bad or missing organisation to the dashboard without touching the database", async () => {
    expect(await target(() => createSite(form({ org_id: "nope", ...details() })))).toBe("/dashboard");
    expect(await target(() => createSite(form(details())))).toBe("/dashboard");
    nothingWritten();
  });

  it("says what is wrong with each field and writes nothing", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ name: "  " }, "site_name"],
      [{ name: "x".repeat(121) }, "site_name"],
      [{ address: "" }, "site_address"],
      [{ latitude: "91" }, "site_latitude"],
      [{ latitude: "1e3" }, "site_latitude"],
      [{ longitude: "-181" }, "site_longitude"],
      [{ radius: "49" }, "site_radius"],
      [{ radius: "2001" }, "site_radius"],
      [{ radius: "200.5" }, "site_radius"]
    ];
    for (const [over, code] of cases) {
      expect(await target(() => createSite(created(over)))).toBe(`${NEW}&error=${code}`);
    }
    nothingWritten();
  });

  it("inserts exactly the six columns a manager may set, trimmed and as numbers, and no status", async () => {
    expect(await target(() => createSite(created({ name: "  Tower A  ", radius: "50" })))).toBe(`${LIST}&saved=1`);

    expect(db.inserts).toEqual([
      {
        table: "sites",
        values: {
          org_id: ORG,
          name: "Tower A",
          address: "12 MG Road, Pune",
          latitude: 18.5204,
          longitude: 73.8567,
          geofence_radius_m: 50
        }
      }
    ]);
    expect(db.revalidated).toEqual(["/sites"]);
  });

  it("never passes along a column the form was not meant to carry", async () => {
    await target(() => createSite(created({ id: SITE, status: "archived", created_by: "someone", archived_at: "2020-01-01" })));
    expect(Object.keys(db.inserts[0]!.values as object).sort()).toEqual([
      "address",
      "geofence_radius_m",
      "latitude",
      "longitude",
      "name",
      "org_id"
    ]);
  });

  it("says who may create, and when the name is taken, and nothing else about the database", async () => {
    db.insertResult = { error: { code: "42501" } };
    expect(await target(() => createSite(created()))).toBe(`${NEW}&error=site_forbidden`);
    db.insertResult = { error: { code: "23505" } };
    expect(await target(() => createSite(created()))).toBe(`${NEW}&error=site_exists`);
    db.insertResult = { error: { code: "23514" } };
    expect(await target(() => createSite(created()))).toBe(`${NEW}&error=generic`);
    db.insertResult = { error: { code: "XX000" } };
    expect(await target(() => createSite(created()))).toBe(`${NEW}&error=generic`);
    expect(db.revalidated).toEqual([]);
  });
});

describe("updateSite", () => {
  it("sends a bad id to the dashboard without touching the database", async () => {
    for (const over of [{ org_id: "nope" }, { site_id: "nope" }, { site_id: "" }]) {
      expect(await target(() => updateSite(form({ org_id: ORG, site_id: SITE, ...details(), ...over })))).toBe("/dashboard");
    }
    nothingWritten();
  });

  it("says what is wrong with the input and writes nothing", async () => {
    expect(await target(() => updateSite(edited({ name: "" })))).toBe(`${PAGE}&error=site_name`);
    expect(await target(() => updateSite(edited({ latitude: "abc" })))).toBe(`${PAGE}&error=site_latitude`);
    expect(await target(() => updateSite(edited({ radius: "10" })))).toBe(`${PAGE}&error=site_radius`);
    nothingWritten();
  });

  it("changes only the five detail columns, on the one site of that organisation", async () => {
    expect(await target(() => updateSite(edited({ name: "Tower B" })))).toBe(`${PAGE}&saved=1`);

    expect(db.updates).toEqual([
      {
        table: "sites",
        values: { name: "Tower B", address: "12 MG Road, Pune", latitude: 18.5204, longitude: 73.8567, geofence_radius_m: 200 },
        filters: [
          ["id", SITE],
          ["org_id", ORG]
        ]
      }
    ]);
    expect(db.revalidated).toEqual(["/sites"]);
  });

  it("never sends a status or an organisation, even if the form carries one", async () => {
    await target(() => updateSite(edited({ status: "archived", archived_at: "2020-01-01", new_org_id: SITE })));
    expect(Object.keys(db.updates[0]!.values as object).sort()).toEqual(["address", "geofence_radius_m", "latitude", "longitude", "name"]);
  });

  it("reads an update that changed no row as not allowed, as RLS hides archived and foreign sites", async () => {
    db.updateResult = { data: [], error: null };
    expect(await target(() => updateSite(edited()))).toBe(`${PAGE}&error=site_not_allowed`);
    db.updateResult = { data: null, error: null };
    expect(await target(() => updateSite(edited()))).toBe(`${PAGE}&error=site_not_allowed`);
    expect(db.revalidated).toEqual([]);
  });

  it("maps the database's answers to fixed codes", async () => {
    db.updateResult = { data: null, error: { code: "42501" } };
    expect(await target(() => updateSite(edited()))).toBe(`${PAGE}&error=site_forbidden`);
    db.updateResult = { data: null, error: { code: "23505" } };
    expect(await target(() => updateSite(edited()))).toBe(`${PAGE}&error=site_exists`);
    db.updateResult = { data: null, error: { code: "XX000" } };
    expect(await target(() => updateSite(edited()))).toBe(`${PAGE}&error=generic`);
  });
});

describe("setSiteStatus", () => {
  const moved = (status: string, over: Record<string, string> = {}) => form({ org_id: ORG, site_id: SITE, status, ...over });

  it("sends a bad id to the dashboard without touching the database", async () => {
    expect(await target(() => setSiteStatus(moved("active", { org_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => setSiteStatus(moved("active", { site_id: "nope" })))).toBe("/dashboard");
    nothingWritten();
  });

  it("refuses archived and anything outside the four, before calling the database", async () => {
    for (const bad of ["archived", "ARCHIVED", "", "done", "__proto__", "constructor"]) {
      expect(await target(() => setSiteStatus(moved(bad))), bad).toBe(`${PAGE}&error=site_status`);
    }
    expect(await target(() => setSiteStatus(form({ org_id: ORG, site_id: SITE })))).toBe(`${PAGE}&error=site_status`);
    nothingWritten();
  });

  it("moves among the four statuses in any direction, writing only status", async () => {
    const order = ["planned", "active", "paused", "completed", "planned", "completed", "active"];
    for (const s of order) {
      db.updates.length = 0;
      expect(await target(() => setSiteStatus(moved(s)))).toBe(`${PAGE}&saved=1`);
      expect(db.updates).toEqual([
        {
          table: "sites",
          values: { status: s },
          filters: [
            ["id", SITE],
            ["org_id", ORG]
          ]
        }
      ]);
    }
    expect(db.revalidated).toHaveLength(order.length);
  });

  it("reads 0 rows as not allowed, and maps the database's answers", async () => {
    db.updateResult = { data: [], error: null };
    expect(await target(() => setSiteStatus(moved("paused")))).toBe(`${PAGE}&error=site_not_allowed`);
    db.updateResult = { data: null, error: { code: "42501" } };
    expect(await target(() => setSiteStatus(moved("paused")))).toBe(`${PAGE}&error=site_forbidden`);
    db.updateResult = { data: null, error: { code: "XX000" } };
    expect(await target(() => setSiteStatus(moved("paused")))).toBe(`${PAGE}&error=generic`);
  });
});

describe("archiveSite", () => {
  const archive = (over: Record<string, string> = {}) => form({ org_id: ORG, site_id: SITE, ...over });

  it("sends a bad id to the dashboard without touching the database", async () => {
    expect(await target(() => archiveSite(archive({ org_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => archiveSite(archive({ site_id: "nope" })))).toBe("/dashboard");
    nothingWritten();
  });

  it("calls archive_site with the site id and never updates the status itself", async () => {
    expect(await target(() => archiveSite(archive()))).toBe(`${LIST}&archived=1`);

    expect(db.rpcs).toEqual([{ name: "archive_site", args: { p_site_id: SITE } }]);
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
    expect(db.revalidated).toEqual(["/sites"]);
  });

  it("takes nothing but the ids from the form", async () => {
    await target(() => archiveSite(archive({ status: "active", p_site_id: "other" })));
    expect(db.rpcs).toEqual([{ name: "archive_site", args: { p_site_id: SITE } }]);
  });

  it("says when the caller may not archive, and nothing else about the database", async () => {
    db.rpcResult = { data: null, error: { code: "42501" } };
    expect(await target(() => archiveSite(archive()))).toBe(`${PAGE}&error=site_forbidden`);
    db.rpcResult = { data: null, error: { code: "28000" } };
    expect(await target(() => archiveSite(archive()))).toBe(`${PAGE}&error=generic`);
    db.rpcResult = { data: null, error: { code: "XX000" } };
    expect(await target(() => archiveSite(archive()))).toBe(`${PAGE}&error=generic`);
    expect(db.revalidated).toEqual([]);
  });
});

const USER = "00000000-0000-4000-8000-0000000000a1";
const ASSIGNMENT = "a0000000-0000-4000-8000-000000000001";

describe("assignSupervisor", () => {
  const assign = (over: Record<string, string> = {}) => form({ org_id: ORG, site_id: SITE, user_id: USER, ...over });

  it("sends a bad id to the dashboard without touching the database", async () => {
    expect(await target(() => assignSupervisor(assign({ org_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => assignSupervisor(assign({ site_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => assignSupervisor(form({ org_id: ORG, site_id: SITE })))).toBe("/dashboard");
    nothingWritten();
  });

  it("refuses a missing or malformed person and writes nothing", async () => {
    expect(await target(() => assignSupervisor(form({ org_id: ORG, site_id: SITE })))).toBe("/dashboard");
    expect(await target(() => assignSupervisor(assign({ user_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => assignSupervisor(assign({ user_id: "" })))).toBe("/dashboard");
    nothingWritten();
  });

  it("inserts exactly the organisation, site and person, and reads nothing back", async () => {
    expect(await target(() => assignSupervisor(assign({ assigned_by: "x", unassigned_at: "2000-01-01", role: "owner" })))).toBe(
      `${PAGE}&saved=1`
    );

    // The mock's insert is a plain awaited call: a chained .select() would not exist.
    expect(db.inserts).toEqual([{ table: "site_assignments", values: { org_id: ORG, site_id: SITE, user_id: USER } }]);
    expect(db.updates).toEqual([]);
    expect(db.rpcs).toEqual([]);
    expect(db.revalidated).toEqual(["/sites"]);
  });

  it("maps the database's answers to fixed messages and shows no raw text", async () => {
    const cases: [string, string][] = [
      ["42501", "site_forbidden"],
      ["23505", "assign_exists"],
      ["55000", "assign_archived"],
      ["23503", "assign_member"],
      ["XX000", "generic"],
      ["28000", "generic"]
    ];
    for (const [code, message] of cases) {
      db.insertResult = { error: { code } };
      expect(await target(() => assignSupervisor(assign())), code).toBe(`${PAGE}&error=${message}`);
    }
    expect(db.revalidated).toEqual([]);
  });

  it("maps an error with no code to the generic message", async () => {
    db.insertResult = { error: {} };
    expect(await target(() => assignSupervisor(assign()))).toBe(`${PAGE}&error=generic`);
  });
});

describe("removeSupervisor", () => {
  const remove = (over: Record<string, string> = {}) =>
    form({ org_id: ORG, site_id: SITE, assignment_id: ASSIGNMENT, ...over });

  it("sends a bad id to the dashboard without touching the database", async () => {
    expect(await target(() => removeSupervisor(remove({ org_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => removeSupervisor(remove({ site_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => removeSupervisor(remove({ assignment_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => removeSupervisor(form({ org_id: ORG, site_id: SITE })))).toBe("/dashboard");
    nothingWritten();
  });

  it("closes the one row by setting only unassigned_at, filtered on id, site and organisation", async () => {
    expect(
      await target(() => removeSupervisor(remove({ unassigned_by: "x", user_id: USER, status: "archived" })))
    ).toBe(`${PAGE}&saved=1`);

    expect(db.updates).toHaveLength(1);
    const [update] = db.updates;
    expect(update?.table).toBe("site_assignments");
    expect(Object.keys(update?.values as object)).toEqual(["unassigned_at"]);
    const at = (update?.values as { unassigned_at: unknown }).unassigned_at;
    expect(typeof at === "string" && !Number.isNaN(Date.parse(at))).toBe(true);
    expect(update?.filters).toEqual([
      ["id", ASSIGNMENT],
      ["site_id", SITE],
      ["org_id", ORG]
    ]);
    expect(db.inserts).toEqual([]);
    expect(db.rpcs).toEqual([]);
    expect(db.revalidated).toEqual(["/sites"]);
  });

  it("reads 0 rows as not allowed: already removed, an archived site, or not theirs", async () => {
    db.updateResult = { data: [], error: null };
    expect(await target(() => removeSupervisor(remove()))).toBe(`${PAGE}&error=assign_not_allowed`);
    db.updateResult = { data: null, error: null };
    expect(await target(() => removeSupervisor(remove()))).toBe(`${PAGE}&error=assign_not_allowed`);
    expect(db.revalidated).toEqual([]);
  });

  it("maps the database's answers to fixed messages", async () => {
    db.updateResult = { data: null, error: { code: "42501" } };
    expect(await target(() => removeSupervisor(remove()))).toBe(`${PAGE}&error=site_forbidden`);
    db.updateResult = { data: null, error: { code: "XX000" } };
    expect(await target(() => removeSupervisor(remove()))).toBe(`${PAGE}&error=generic`);
  });

  it("never deletes: the mock has no delete, so a delete call would throw", async () => {
    await target(() => removeSupervisor(remove()));
    expect(db.inserts).toEqual([]);
  });
});

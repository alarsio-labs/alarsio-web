import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  rpcResult: { error: null } as { error: { code?: string } | null },
  original: { data: null, error: null } as { data: unknown; error: null },
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
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return db.rpcResult;
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => db.original }) }) }),
  }),
}));

const { recordAdvance, cancelAdvance } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const SITE = "51000000-0000-4000-8000-000000000001";
const WORKER = "b1000000-0000-4000-8000-000000000001";
const ADVANCE = "c1000000-0000-4000-8000-000000000001";
const REVERSAL = "c2000000-0000-4000-8000-000000000002";
const BACK = `/advances?org=${ORG}&site=${SITE}`;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const record = (over: Record<string, string> = {}) =>
  form({ org_id: ORG, site_id: SITE, advance_id: ADVANCE, worker_id: WORKER, amount: "500", paid_on: "2026-11-28", note: "", ...over });
const cancel = (over: Record<string, string> = {}) =>
  form({ org_id: ORG, site_id: SITE, advance_id: ADVANCE, reversal_id: REVERSAL, ...over });
// The mocked redirect throws, as the real one does. Returns where it went.
const redirectOf = async (run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith("REDIRECT ")) return message.slice("REDIRECT ".length);
    throw e;
  }
  throw new Error("expected a redirect");
};

beforeEach(() => {
  db.calls.length = 0;
  db.revalidated.length = 0;
  db.rpcResult = { error: null };
  db.original = { data: null, error: null };
});

describe("recordAdvance", () => {
  it("sends the advance in paise through the function and shows Saved", async () => {
    expect(await redirectOf(() => recordAdvance(record({ amount: "500.5", note: " cash " })))).toBe(`${BACK}&saved=1`);
    expect(db.calls).toEqual([
      {
        fn: "apply_worker_advance",
        args: { p_id: ADVANCE, p_site_id: SITE, p_worker_id: WORKER, p_paid_on: "2026-11-28", p_amount_paise: 50050, p_note: "cash" },
      },
    ]);
    expect(db.revalidated).toEqual(["/advances"]);
  });

  it.each([
    [{ amount: "0" }, "advance_amount"],
    [{ paid_on: "2099-01-01" }, "advance_date"],
    [{ note: "a".repeat(501) }, "advance_note"],
    [{ worker_id: "" }, "advance_worker"],
  ])("stops a bad form %j before the database", async (over, code) => {
    expect(await redirectOf(() => recordAdvance(record(over)))).toBe(`${BACK}&error=${code}`);
    expect(db.calls).toEqual([]);
  });

  it("sends a bad org or site to the dashboard", async () => {
    expect(await redirectOf(() => recordAdvance(record({ site_id: "nope" })))).toBe("/dashboard");
    expect(await redirectOf(() => recordAdvance(record({ advance_id: "" })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["42501", "advance_forbidden"],
    ["23514", "advance_rule"],
    ["23505", "advance_exists"],
    ["22023", "advance_date"],
    ["XX000", "generic"],
  ])("shows a fixed message for SQLSTATE %s", async (state, code) => {
    db.rpcResult = { error: { code: state } };
    expect(await redirectOf(() => recordAdvance(record()))).toBe(`${BACK}&error=${code}`);
    expect(db.revalidated).toEqual([]);
  });
});

describe("cancelAdvance", () => {
  const original = { site_id: SITE, worker_id: WORKER, paid_on: "2026-11-20", amount_paise: 50000 };

  it("reverses the whole advance on its own day, copying the stored values", async () => {
    db.original = { data: original, error: null };
    expect(await redirectOf(() => cancelAdvance(cancel()))).toBe(`${BACK}&saved=1`);
    expect(db.calls).toEqual([
      {
        fn: "apply_worker_advance",
        args: {
          p_id: REVERSAL,
          p_site_id: SITE,
          p_worker_id: WORKER,
          p_paid_on: "2026-11-20",
          p_amount_paise: 50000,
          p_note: null,
          p_reverses_id: ADVANCE,
        },
      },
    ]);
  });

  it("says so when the advance cannot be read, without calling the function", async () => {
    expect(await redirectOf(() => cancelAdvance(cancel()))).toBe(`${BACK}&error=advance_rule`);
    expect(db.calls).toEqual([]);
  });

  it("shows a fixed message when the function refuses", async () => {
    db.original = { data: original, error: null };
    db.rpcResult = { error: { code: "23505" } };
    expect(await redirectOf(() => cancelAdvance(cancel()))).toBe(`${BACK}&error=advance_exists`);
  });

  it("sends a bad id to the dashboard", async () => {
    expect(await redirectOf(() => cancelAdvance(cancel({ advance_id: "x" })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });
});

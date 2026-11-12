import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny stand-in for the Supabase client: who is signed in, and what profiles.update/insert return.
const state: {
  user: { id: string } | null;
  update: { data: { id: string }[] | null; error: { code: string } | null };
  insert: { error: { code: string } | null };
  calls: { op: string; values?: unknown; id?: unknown }[];
} = { user: null, update: { data: [], error: null }, insert: { error: null }, calls: [] };

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        update: (values: unknown) => ({
          eq: (_col: string, id: unknown) => ({
            select: async () => {
              state.calls.push({ op: "update", values, id });
              return state.update;
            }
          })
        }),
        insert: async (values: unknown) => {
          state.calls.push({ op: "insert", values });
          return state.insert;
        }
      };
    }
  })
}));

const { updateMyName } = await import("./account-actions");

const fd = (name: string) => {
  const f = new FormData();
  f.set("full_name", name);
  return f;
};
const idle = { status: "idle" } as const;

beforeEach(() => {
  state.user = { id: "u1" };
  state.update = { data: [{ id: "u1" }], error: null };
  state.insert = { error: null };
  state.calls = [];
  revalidatePath.mockReset();
});

// Pre-launch audit issue 6: negative cases first.
describe("updateMyName", () => {
  it("refuses a blank or too-long name without touching the database", async () => {
    expect(await updateMyName(idle, fd("   "))).toEqual({ status: "error", message: "Type your name." });
    expect(await updateMyName(idle, fd("x".repeat(121)))).toEqual({ status: "error", message: "Use at most 120 characters." });
    expect(state.calls).toEqual([]);
  });

  it("refuses when nobody is signed in", async () => {
    state.user = null;
    expect((await updateMyName(idle, fd("Ramesh Kumar"))).status).toBe("error");
    expect(state.calls).toEqual([]);
  });

  it("says it could not save when the database refuses, and does not revalidate", async () => {
    state.update = { data: null, error: { code: "42501" } };
    expect(await updateMyName(idle, fd("Ramesh Kumar"))).toEqual({ status: "error", message: "Your name could not be saved. Try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("updates only the signed-in person's own row, with the cleaned name", async () => {
    expect(await updateMyName(idle, fd("  Ramesh   Kumar "))).toEqual({ status: "saved", name: "Ramesh Kumar" });
    expect(state.calls).toEqual([{ op: "update", values: { full_name: "Ramesh Kumar" }, id: "u1" }]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("creates the profile row with the name when none exists yet", async () => {
    state.update = { data: [], error: null };
    expect(await updateMyName(idle, fd("Sunita Devi"))).toEqual({ status: "saved", name: "Sunita Devi" });
    expect(state.calls[1]).toEqual({ op: "insert", values: { id: "u1", full_name: "Sunita Devi" } });
  });
});

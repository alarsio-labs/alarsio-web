import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  rpc: { data: true, error: null } as { data: unknown; error: { code?: string } | null },
  rpcCalls: [] as { name: string; args: unknown }[]
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      return state.rpc;
    }
  })
}));

const { requireSiteManager } = await import("./guard");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const next = (o: string) => `/sites?org=${o}`;

async function target(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const m = /^REDIRECT (.*)$/.exec(error instanceof Error ? error.message : "");
    if (m?.[1]) return m[1];
    throw error;
  }
  return "no redirect";
}

beforeEach(() => {
  state.user = { id: "u1" };
  state.rpc = { data: true, error: null };
  state.rpcCalls.length = 0;
});

describe("requireSiteManager", () => {
  it("sends a missing or malformed organisation to the dashboard without asking the database", async () => {
    for (const bad of [undefined, "", "nope", ["a"], 7]) {
      expect(await target(() => requireSiteManager(bad, next))).toBe("/dashboard");
    }
    expect(state.rpcCalls).toEqual([]);
  });

  it("sends a signed-out visitor to sign in, coming back to the same page", async () => {
    state.user = null;
    expect(await target(() => requireSiteManager(ORG, next))).toBe(`/sign-in?next=${encodeURIComponent(`/sites?org=${ORG}`)}`);
    expect(state.rpcCalls).toEqual([]);
  });

  it("asks can_manage_sites about the organisation in the URL, and lets a manager in", async () => {
    const result = await requireSiteManager(ORG, next);
    expect(result.org).toBe(ORG);
    expect(state.rpcCalls).toEqual([{ name: "can_manage_sites", args: { p_org_id: ORG } }]);
  });

  it("sends anyone who is not a manager to the dashboard: supervisor, accountant, non-member", async () => {
    for (const data of [false, null, "true", 1, undefined]) {
      state.rpc = { data, error: null };
      expect(await target(() => requireSiteManager(ORG, next)), String(data)).toBe("/dashboard");
    }
  });

  it("says something went wrong, rather than hiding it, when the check itself fails", async () => {
    state.rpc = { data: null, error: { code: "XX000" } };
    expect(await target(() => requireSiteManager(ORG, next))).toBe("/dashboard?error=generic");
  });
});

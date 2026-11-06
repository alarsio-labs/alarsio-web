import { beforeEach, describe, expect, it, vi } from "vitest";

// Accepting an invite (#141). accept_invite returns null for an unknown, expired,
// revoked or used token: one answer for all (ADR-019, I5).

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  result: { data: "membership-id" as unknown, error: null as { code?: string } | null }
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
// Only rpc exists on this client, so the test also proves the action writes no table.
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return db.result;
    }
  })
}));

const { acceptInvite } = await import("./actions");

const TOKEN = "a".repeat(64);
const form = (token: string) => {
  const f = new FormData();
  f.set("token", token);
  return f;
};

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
  db.calls.length = 0;
  db.result = { data: "membership-id", error: null };
});

describe("acceptInvite", () => {
  it("refuses a malformed token without calling the database", async () => {
    for (const token of ["", "short", "A".repeat(64), `${"a".repeat(63)}g`, "a".repeat(65)]) {
      expect(await target(() => acceptInvite(form(token)))).toBe("/invite/invalid");
    }
    expect(db.calls).toHaveLength(0);
  });

  it("refuses an unknown, expired, revoked or used token with one answer", async () => {
    db.result = { data: null, error: null };
    expect(await target(() => acceptInvite(form(TOKEN)))).toBe("/invite/invalid");
  });

  it("refuses when the database refuses", async () => {
    db.result = { data: null, error: { code: "42501" } };
    expect(await target(() => acceptInvite(form(TOKEN)))).toBe("/invite/invalid");
  });

  it("says so when there were too many attempts", async () => {
    db.result = { data: null, error: { code: "PT429" } };
    expect(await target(() => acceptInvite(form(TOKEN)))).toBe("/invite/invalid?reason=rate");
  });

  it("accepts a valid token and goes to the dashboard", async () => {
    expect(await target(() => acceptInvite(form(TOKEN)))).toBe("/dashboard");
    expect(db.calls).toEqual([{ fn: "accept_invite", args: { p_token: TOKEN } }]);
  });
});

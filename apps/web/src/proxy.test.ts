import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy asks Supabase who is signed in; the test decides the answer.
let user: { id: string } | null = null;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } })
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
const { proxy } = await import("./proxy");

const go = (path: string, method = "GET") => proxy(new NextRequest(new URL(path, "https://alarsio.test"), { method }));
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  user = null;
});

// #140: negative cases first.
describe("proxy", () => {
  it("sends a signed-out visitor on /wages and /export to sign in, keeping where they were going", async () => {
    expect(location(await go("/wages?org=o1"))).toBe("https://alarsio.test/sign-in?next=%2Fwages%3Forg%3Do1");
    expect(location(await go("/export?org=o1"))).toBe("https://alarsio.test/sign-in?next=%2Fexport%3Forg%3Do1");
    expect(location(await go("/wages/period-1?org=o1"))).toMatch(/\/sign-in\?next=%2Fwages%2Fperiod-1/);
  });

  it("leaves the signed-out export download POST to its own sign-in", async () => {
    expect(location(await go("/export/download", "POST"))).toBeNull();
  });

  it("does not redirect public pages or look-alike paths", async () => {
    for (const p of ["/", "/sign-in", "/invite/abc", "/wagesx"]) expect(location(await go(p))).toBeNull();
  });

  it("lets a signed-in user through to /wages and /export", async () => {
    user = { id: "u1" };
    expect(location(await go("/wages?org=o1"))).toBeNull();
    expect(location(await go("/export?org=o1"))).toBeNull();
  });
});

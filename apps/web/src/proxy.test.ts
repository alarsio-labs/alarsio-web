import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy asks Supabase who is signed in; the test decides the answer.
let user: { id: string } | null = null;
let claimsCalls = 0;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => {
        claimsCalls += 1;
        return { data: user ? { claims: { sub: user.id } } : null, error: null };
      }
    }
  })
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
const { proxy } = await import("./proxy");

// A browser with a Supabase session sends sb-<ref>-auth-token; without it the proxy skips Auth.
const SESSION = "sb-example-auth-token=base64-abc";
const go = (path: string, method = "GET", cookie?: string) =>
  proxy(new NextRequest(new URL(path, "https://alarsio.test"), { method, headers: cookie ? { cookie } : {} }));
const goSignedIn = (path: string) => go(path, "GET", SESSION);
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  user = null;
  claimsCalls = 0;
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

  it("does no Auth work for a visitor with no session cookie, on public or signed-in pages", async () => {
    for (const p of ["/", "/about", "/sign-in", "/download"]) expect(location(await go(p))).toBeNull();
    expect(location(await go("/overview?org=o1"))).toMatch(/\/sign-in\?next=%2Foverview/);
    expect(claimsCalls).toBe(0);
  });

  it("still sends a visitor to sign in when the session cookie is there but no longer valid", async () => {
    expect(location(await go("/wages?org=o1", "GET", SESSION))).toMatch(/\/sign-in\?next=%2Fwages/);
    expect(claimsCalls).toBe(1);
  });

  it("does not take an unrelated sb- cookie for a session", async () => {
    user = { id: "u1" };
    expect(location(await go("/", "GET", "sb-example-other=1"))).toBeNull();
    expect(claimsCalls).toBe(0);
  });

  it("sends a signed-in visitor on / to their dashboard, so the landing page can stay static", async () => {
    user = { id: "u1" };
    expect(location(await goSignedIn("/"))).toBe("https://alarsio.test/dashboard");
    expect(location(await goSignedIn("/about"))).toBeNull();
  });

  it("lets a signed-in user through to /wages and /export", async () => {
    user = { id: "u1" };
    expect(location(await goSignedIn("/wages?org=o1"))).toBeNull();
    expect(location(await goSignedIn("/export?org=o1"))).toBeNull();
  });
});

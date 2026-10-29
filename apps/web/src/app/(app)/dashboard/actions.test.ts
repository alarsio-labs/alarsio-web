import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ rpc }) }));

const { createOrganization } = await import("./actions");

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no redirect";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "org-1", error: null });
});

// Issue #139: negative cases first.
describe("createOrganization", () => {
  it("sends an empty or over-120-character name back with org_name, and calls nothing", async () => {
    expect(await outcome(createOrganization(fd({ name: "" })))).toBe("REDIRECT /dashboard?error=org_name");
    expect(await outcome(createOrganization(fd({ name: "x".repeat(121) })))).toBe("REDIRECT /dashboard?error=org_name");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lands on org_failed when the database refuses the timezone", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023" } });
    expect(await outcome(createOrganization(fd({ name: "Patil", timezone: "Mars/Olympus" })))).toBe("REDIRECT /dashboard?error=org_failed");
    expect(rpc).toHaveBeenCalledWith("create_organization", { p_name: "Patil", p_timezone: "Mars/Olympus" });
  });

  it("sends Asia/Kolkata when no timezone is chosen", async () => {
    await outcome(createOrganization(fd({ name: "Patil" })));
    expect(rpc).toHaveBeenCalledWith("create_organization", { p_name: "Patil", p_timezone: "Asia/Kolkata" });
  });

  it("creates with the chosen name and timezone and returns to the dashboard", async () => {
    expect(await outcome(createOrganization(fd({ name: " Patil Constructions ", timezone: "Asia/Dubai" })))).toBe("REDIRECT /dashboard");
    expect(rpc).toHaveBeenCalledWith("create_organization", { p_name: "Patil Constructions", p_timezone: "Asia/Dubai" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// A query builder that records calls and resolves to whatever `result` holds.
type Result = { data: unknown; error: { code?: string } | null };
const calls: { table: string; ops: [string, unknown[]][] }[] = [];
const results: Result[] = [];
function builder(table: string) {
  const entry = { table, ops: [] as [string, unknown[]][] };
  calls.push(entry);
  const b: Record<string, unknown> = {};
  for (const op of ["update", "insert", "eq", "is", "select"]) {
    b[op] = (...args: unknown[]) => {
      entry.ops.push([op, args]);
      return b;
    };
  }
  b.then = (resolve: (r: Result) => unknown) => resolve(results.shift() ?? { data: [], error: null });
  return b;
}
const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ from: builder, rpc }) }));

const { addRate, anonymize, assignToSite, saveWorker, unassign } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const W = "77000000-0000-4000-8000-000000000001";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ org_id: ORG, worker_id: W, ...o })) f.set(k, v);
  return f;
};
const worker = { full_name: "Ravi", trade: "mason", pay_type: "daily", phone: "", status: "active" };

async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no redirect";
  } catch (e) {
    const m = /REDIRECT .*[?&](error|done)=(\w+)/.exec(String(e));
    return m ? `${m[1]}=${m[2]}` : String(e);
  }
}

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
  rpc.mockReset();
});

describe("saveWorker", () => {
  it("reports not allowed only when RLS changed 0 rows", async () => {
    results.push({ data: [], error: null });
    expect(await outcome(saveWorker(fd(worker)))).toBe("error=not_permitted");
  });

  it("reports the pay type lock and other database errors by code", async () => {
    results.push({ data: null, error: { code: "55000" } });
    expect(await outcome(saveWorker(fd(worker)))).toBe("error=pay_type_locked");
    results.push({ data: null, error: { code: "XX000" } });
    expect(await outcome(saveWorker(fd(worker)))).toBe("error=generic");
  });

  it("refuses bad input without calling the database", async () => {
    expect(await outcome(saveWorker(fd({ ...worker, pay_type: "monthly" })))).toBe("error=worker_invalid");
    expect(await outcome(saveWorker(fd({ ...worker, full_name: "x".repeat(121) })))).toBe("error=worker_invalid");
    expect(calls).toHaveLength(0);
  });

  it("closes open site assignments when a worker is made inactive", async () => {
    results.push({ data: [{ id: W }], error: null }, { data: null, error: null });
    expect(await outcome(saveWorker(fd({ ...worker, status: "inactive" })))).toBe("done=worker_saved");
    expect(calls.map((c) => c.table)).toEqual(["workers", "worker_site_assignments"]);
    expect(calls[1]?.ops).toContainEqual(["eq", ["worker_id", W]]);
    expect(calls[1]?.ops).toContainEqual(["is", ["unassigned_at", null]]);
  });
});

describe("addRate", () => {
  it("refuses a rate over the ceiling or a date outside the window", async () => {
    expect(await outcome(addRate(fd({ rate: "100000.01", effective_from: "2026-10-19" })))).toBe("error=rate_invalid");
    expect(await outcome(addRate(fd({ rate: "650", effective_from: "1900-01-01" })))).toBe("error=rate_date");
    expect(calls).toHaveLength(0);
  });

  it("maps 23505 and 42501", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    results.push({ data: null, error: { code: "23505" } });
    expect(await outcome(addRate(fd({ rate: "650", effective_from: today })))).toBe("error=rate_same_day");
    results.push({ data: null, error: { code: "42501" } });
    expect(await outcome(addRate(fd({ rate: "650", effective_from: today })))).toBe("error=not_permitted");
  });
});

describe("assignToSite and unassign", () => {
  const SITE = "51000000-0000-4000-8000-000000000001";

  it("maps a duplicate and an archived site", async () => {
    results.push({ data: null, error: { code: "23505" } });
    expect(await outcome(assignToSite(fd({ site_id: SITE })))).toBe("error=assign_duplicate");
    results.push({ data: null, error: { code: "55000" } });
    expect(await outcome(assignToSite(fd({ site_id: SITE })))).toBe("error=assign_blocked");
  });

  it("only closes an assignment of this worker, and 0 rows is not allowed", async () => {
    results.push({ data: [], error: null });
    expect(await outcome(unassign(fd({ assignment_id: SITE })))).toBe("error=not_permitted");
    expect(calls[0]?.ops).toContainEqual(["eq", ["worker_id", W]]);
    results.push({ data: null, error: { code: "XX000" } });
    expect(await outcome(unassign(fd({ assignment_id: SITE })))).toBe("error=generic");
  });
});

describe("anonymize", () => {
  it("needs the confirm box", async () => {
    expect(await outcome(anonymize(fd({})))).toBe("error=generic");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("says not allowed only for 42501", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "42501" } });
    expect(await outcome(anonymize(fd({ confirm: "yes" })))).toBe("error=not_permitted");
    rpc.mockResolvedValueOnce({ error: { code: "XX000" } });
    expect(await outcome(anonymize(fd({ confirm: "yes" })))).toBe("error=generic");
  });
});

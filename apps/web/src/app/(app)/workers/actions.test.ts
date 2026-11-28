import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const insert = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ rpc, from: () => ({ insert: (row: unknown) => ({ select: () => ({ single: () => insert(row) }) }) }) })
}));

const { addWorker, importWorkers } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const row = { code: "W-1", full_name: "Ravi", trade: "mason", pay_type: "daily" };

describe("addWorker", () => {
  const WORKER = "77000000-0000-4000-8000-000000000001";
  const form = (over: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ org_id: ORG, full_name: " Ravi ", trade: "mason", pay_type: "daily", phone: "98765 43210", ...over })) f.set(k, v);
    return f;
  };
  beforeEach(() => insert.mockReset());

  it("sends no code, so the database gives the next one, and opens the new worker", async () => {
    insert.mockResolvedValue({ data: { id: WORKER }, error: null });
    await expect(addWorker(form())).rejects.toThrow(`REDIRECT /workers/${WORKER}?org=${ORG}&done=worker_added`);
    expect(insert).toHaveBeenCalledWith({ org_id: ORG, full_name: "Ravi", trade: "mason", pay_type: "daily", phone: "98765 43210" });
  });

  it("ignores a code in the form: the code is never typed", async () => {
    insert.mockResolvedValue({ data: { id: WORKER }, error: null });
    await expect(addWorker(form({ code: "MINE" }))).rejects.toThrow("REDIRECT /workers/");
    expect(insert.mock.calls[0]?.[0]).not.toHaveProperty("code");
  });

  it("goes back to the list with the error when the insert fails", async () => {
    insert.mockResolvedValue({ data: null, error: { code: "23514" } });
    await expect(addWorker(form())).rejects.toThrow(`REDIRECT /workers?org=${ORG}&error=worker_invalid`);
  });

  it("refuses a missing phone before calling the database", async () => {
    await expect(addWorker(form({ phone: " " }))).rejects.toThrow(`REDIRECT /workers?org=${ORG}&error=worker_invalid`);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a missing name before calling the database", async () => {
    await expect(addWorker(form({ full_name: " " }))).rejects.toThrow(`REDIRECT /workers?org=${ORG}&error=worker_invalid`);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("importWorkers", () => {
  beforeEach(() => rpc.mockReset());

  it("refuses a bad org id, no rows and too many rows without calling the database", async () => {
    expect(await importWorkers("nope", [row])).toEqual({ ok: false, message: "Unknown organisation." });
    expect(await importWorkers(ORG, [])).toMatchObject({ ok: false });
    expect(await importWorkers(ORG, Array.from({ length: 1001 }, () => row))).toMatchObject({ ok: false, message: expect.stringMatching(/1000/) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a malformed or oversized row instead of cutting it short", async () => {
    expect(await importWorkers(ORG, [{ ...row, code: 7 }])).toMatchObject({ ok: false });
    expect(await importWorkers(ORG, [{ ...row, code: "x".repeat(501) }])).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes long values through unchanged, for the database to judge", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const code = "C".repeat(45);
    await importWorkers(ORG, [{ ...row, code }]);
    expect(rpc).toHaveBeenCalledWith("import_workers", { p_org_id: ORG, p_rows: [{ ...row, code }] });
  });

  it("maps the database's per-row results, dropping malformed ones", async () => {
    rpc.mockResolvedValue({
      data: [
        { row: 1, code: "W-1", result: "created" },
        { row: 2, code: "W-2", result: "rejected", reason: "pay_type_locked" },
        { row: 3, result: "hacked" },
        "junk"
      ],
      error: null
    });
    expect(await importWorkers(ORG, [row, row])).toEqual({
      ok: true,
      results: [
        { row: 1, code: "W-1", result: "created" },
        { row: 2, code: "W-2", result: "rejected", reason: "pay_type_locked" }
      ]
    });
  });

  it("says who may import on 42501, and nothing was saved on any other error", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await importWorkers(ORG, [row])).toEqual({ ok: false, message: "Only an owner or project manager can import workers." });
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    expect(await importWorkers(ORG, [row])).toEqual({ ok: false, message: "The import failed. Nothing was saved. Try again." });
  });
});

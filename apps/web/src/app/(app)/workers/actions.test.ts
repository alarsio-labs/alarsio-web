import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseServer: async () => ({ rpc }) }));

const { importWorkers } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const row = { code: "W-1", full_name: "Ravi", trade: "mason", pay_type: "daily" };

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

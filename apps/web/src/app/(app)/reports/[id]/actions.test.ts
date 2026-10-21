import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  result: { error: null } as { error: { code?: string } | null },
  revalidated: [] as string[]
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => db.revalidated.push(p) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
// Only rpc exists on this client: a write through .from(...) would throw, so the
// tests also prove the report pages write to no table.
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return db.result;
    }
  })
}));

const { reviewReport, sendBackReport } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const REPORT = "d1000000-0000-4000-8000-000000000001";
const BACK = `/reports/${REPORT}?org=${ORG}`;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const sendBack = (over: Record<string, string> = {}) => form({ report_id: REPORT, org_id: ORG, reason: "Recount", ...over });

/** What the action redirected to: every path out of an action is a redirect. */
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
  db.revalidated.length = 0;
  db.result = { error: null };
});

describe("sendBackReport", () => {
  it("sends a bad id to the dashboard without a call", async () => {
    expect(await target(() => sendBackReport(sendBack({ report_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => sendBackReport(sendBack({ org_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => sendBackReport(form({ reason: "x" })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });

  it("refuses a missing, blank or over-long reason and makes no call", async () => {
    for (const reason of ["", "   ", "\n", "a".repeat(1001)]) {
      expect(await target(() => sendBackReport(sendBack({ reason })))).toBe(`${BACK}&error=send_back_reason`);
    }
    expect(await target(() => sendBackReport(form({ report_id: REPORT, org_id: ORG })))).toBe(`${BACK}&error=send_back_reason`);
    expect(db.calls).toEqual([]);
  });

  it("sends back through send_back_daily_report with the trimmed reason", async () => {
    expect(await target(() => sendBackReport(sendBack({ reason: "  Headcount is wrong  " })))).toBe(BACK);
    expect(db.calls).toEqual([{ fn: "send_back_daily_report", args: { p_report_id: REPORT, p_reason: "Headcount is wrong" } }]);
    expect(db.revalidated).toEqual(["/reports"]);
  });

  it("shows the database's refusal as a fixed message", async () => {
    for (const [code, message] of [
      ["42501", "send_back_forbidden"],
      ["22023", "send_back_reason"],
      ["55000", "report_final"],
      ["XX000", "generic"]
    ] as const) {
      db.result = { error: { code } };
      expect(await target(() => sendBackReport(sendBack()))).toBe(`${BACK}&error=${message}`);
    }
    expect(db.revalidated).toEqual([]);
  });
});

describe("reviewReport", () => {
  it("still marks a report reviewed with an optional note", async () => {
    expect(await target(() => reviewReport(form({ report_id: REPORT, org_id: ORG, note: "" })))).toBe(BACK);
    expect(db.calls).toEqual([{ fn: "review_daily_report", args: { p_report_id: REPORT, p_note: null } }]);
  });
});

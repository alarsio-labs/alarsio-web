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
// tests also prove the pages write to no table.
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return db.result;
    }
  })
}));

const { reviewCorrection, reviewDay } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const DAY = "d1000000-0000-4000-8000-000000000001";
const CORR = "c1000000-0000-4000-8000-000000000001";
const BACK = `/attendance/${DAY}?org=${ORG}`;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const day = (over: Record<string, string> = {}) => form({ day_id: DAY, org_id: ORG, decision: "approve", reason: "", ...over });
const corr = (over: Record<string, string> = {}) =>
  form({ correction_id: CORR, day_id: DAY, org_id: ORG, decision: "approve", reason: "", ...over });

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

describe("reviewDay", () => {
  it("sends a bad id to the dashboard without a call", async () => {
    expect(await target(() => reviewDay(day({ day_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => reviewDay(day({ org_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => reviewDay(form({ decision: "approve" })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });

  it("does nothing for a decision that is not approve or reject", async () => {
    for (const decision of ["", "maybe", "APPROVE"]) {
      expect(await target(() => reviewDay(day({ decision })))).toBe(`${BACK}&error=generic`);
    }
    expect(await target(() => reviewDay(form({ day_id: DAY, org_id: ORG })))).toBe(`${BACK}&error=generic`);
    expect(db.calls).toEqual([]);
  });

  it("refuses a reject with no reason and makes no call", async () => {
    for (const reason of ["", "   ", "\n"]) {
      expect(await target(() => reviewDay(day({ decision: "reject", reason })))).toBe(`${BACK}&error=attendance_reason_required`);
    }
    expect(db.calls).toEqual([]);
  });

  it("refuses a reason over 500 characters, for either decision, and makes no call", async () => {
    expect(await target(() => reviewDay(day({ decision: "reject", reason: "a".repeat(501) })))).toBe(`${BACK}&error=attendance_reason_long`);
    expect(await target(() => reviewDay(day({ decision: "approve", reason: "a".repeat(501) })))).toBe(`${BACK}&error=attendance_reason_long`);
    expect(db.calls).toEqual([]);
  });

  it("approves through review_attendance_day with a null reason when none is given", async () => {
    expect(await target(() => reviewDay(day()))).toBe(BACK);
    expect(db.calls).toEqual([{ fn: "review_attendance_day", args: { p_day_id: DAY, p_approve: true, p_reason: null } }]);
    expect(db.revalidated).toEqual(["/attendance"]);
  });

  it("approves with a trimmed note", async () => {
    await target(() => reviewDay(day({ reason: "  checked  " })));
    expect(db.calls[0]!.args).toEqual({ p_day_id: DAY, p_approve: true, p_reason: "checked" });
  });

  it("rejects with the trimmed reason, and accepts exactly 500 characters", async () => {
    expect(await target(() => reviewDay(day({ decision: "reject", reason: "  wrong date  " })))).toBe(BACK);
    expect(db.calls[0]).toEqual({ fn: "review_attendance_day", args: { p_day_id: DAY, p_approve: false, p_reason: "wrong date" } });
    await target(() => reviewDay(day({ decision: "reject", reason: "a".repeat(500) })));
    expect(db.calls[1]!.args).toMatchObject({ p_approve: false, p_reason: "a".repeat(500) });
  });

  it("sends exactly the three arguments of the function and calls nothing else", async () => {
    await target(() => reviewDay(day({ status: "approved", reviewed_by: "someone", site_id: "x" })));
    expect(db.calls).toHaveLength(1);
    expect(Object.keys(db.calls[0]!.args).sort()).toEqual(["p_approve", "p_day_id", "p_reason"]);
  });

  it("shows a fixed message chosen by SQLSTATE, and nothing else from the database", async () => {
    const run = async (code: string | undefined) => {
      db.result = { error: { code } };
      return target(() => reviewDay(day({ decision: "reject", reason: "r" })));
    };
    expect(await run("42501")).toBe(`${BACK}&error=attendance_forbidden`);
    expect(await run("22023")).toBe(`${BACK}&error=attendance_reason_required`);
    expect(await run("55000")).toBe(`${BACK}&error=attendance_day_final`);
    expect(await run("XX000")).toBe(`${BACK}&error=generic`);
    expect(await run(undefined)).toBe(`${BACK}&error=generic`);
    expect(db.revalidated).toEqual([]);
  });

  it("sends a caller whose session ended back to sign in, and returns here afterwards", async () => {
    db.result = { error: { code: "28000" } };
    expect(await target(() => reviewDay(day()))).toBe(`/sign-in?next=${encodeURIComponent(BACK)}`);
  });
});

describe("reviewCorrection", () => {
  it("sends a bad id to the dashboard without a call", async () => {
    expect(await target(() => reviewCorrection(corr({ correction_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => reviewCorrection(corr({ day_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => reviewCorrection(corr({ org_id: "nope" })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });

  it("does nothing for an unknown decision", async () => {
    expect(await target(() => reviewCorrection(corr({ decision: "x" })))).toBe(`${BACK}&error=generic`);
    expect(db.calls).toEqual([]);
  });

  it("refuses a reject with no reason, or a reason that is too long, and makes no call", async () => {
    expect(await target(() => reviewCorrection(corr({ decision: "reject", reason: " " })))).toBe(`${BACK}&error=attendance_reason_required`);
    expect(await target(() => reviewCorrection(corr({ decision: "reject", reason: "a".repeat(501) })))).toBe(`${BACK}&error=attendance_reason_long`);
    expect(db.calls).toEqual([]);
  });

  it("approves and rejects through review_attendance_correction", async () => {
    expect(await target(() => reviewCorrection(corr()))).toBe(BACK);
    expect(await target(() => reviewCorrection(corr({ decision: "reject", reason: " no " })))).toBe(BACK);
    expect(db.calls).toEqual([
      { fn: "review_attendance_correction", args: { p_correction_id: CORR, p_approve: true, p_reason: null } },
      { fn: "review_attendance_correction", args: { p_correction_id: CORR, p_approve: false, p_reason: "no" } }
    ]);
    expect(db.revalidated).toEqual(["/attendance", "/attendance"]);
  });

  it("explains a stale or already-decided correction with its own message", async () => {
    db.result = { error: { code: "55000" } };
    expect(await target(() => reviewCorrection(corr()))).toBe(`${BACK}&error=attendance_correction_stale`);
    db.result = { error: { code: "42501" } };
    expect(await target(() => reviewCorrection(corr()))).toBe(`${BACK}&error=attendance_forbidden`);
    db.result = { error: { code: "XX000" } };
    expect(await target(() => reviewCorrection(corr()))).toBe(`${BACK}&error=generic`);
    expect(db.revalidated).toEqual([]);
  });

  it("sends a caller whose session ended back to sign in", async () => {
    db.result = { error: { code: "28000" } };
    expect(await target(() => reviewCorrection(corr()))).toBe(`/sign-in?next=${encodeURIComponent(BACK)}`);
  });
});

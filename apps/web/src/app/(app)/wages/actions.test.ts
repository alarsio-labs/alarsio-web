import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageFor } from "@/lib/messages";

const db = vi.hoisted(() => ({
  calls: [] as { kind: "rpc" | "insert"; name: string; args: Record<string, unknown> }[],
  result: { error: null } as { error: { code?: string; message?: string } | null },
  revalidated: [] as string[]
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => db.revalidated.push(p) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
// rpc, and an insert that reads nothing back: a .select(), .update() or .delete() would
// throw, so the tests also prove the actions make no other kind of call.
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ kind: "rpc", name, args });
      return db.result;
    },
    from: (name: string) => ({
      insert: async (args: Record<string, unknown>) => {
        db.calls.push({ kind: "insert", name, args });
        return db.result;
      }
    })
  })
}));

const { addAdjustment, calculatePeriod, lockPeriod, reopenPeriod } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PERIOD = "e1000000-0000-4000-8000-000000000001";
const WORKER = "b1000000-0000-4000-8000-000000000001";
const BACK = `/wages/${PERIOD}?org=${ORG}`;
const SAVED = `${BACK}&saved=1`;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const period = (over: Record<string, string> = {}) => form({ org_id: ORG, period_id: PERIOD, ...over });
const reopen = (over: Record<string, string> = {}) => period({ reason: "Late correction for site 2", ...over });
const adjust = (over: Record<string, string> = {}) =>
  period({ worker_id: WORKER, amount: "500", reason: "Advance recovered", ...over });

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

// The errors the database raises, with the SQLSTATE and message from the wage migrations.
const NOT_PERMITTED = { code: "42501", message: "not permitted" };
const REASON_REQUIRED = { code: "22023", message: "a reason of 1 to 500 characters is required" };
const NOT_ENDED = { code: "55000", message: `wage period ${PERIOD} has not ended yet` };
const LOCKED = { code: "55000", message: `wage period ${PERIOD} is locked` };

beforeEach(() => {
  db.calls.length = 0;
  db.revalidated.length = 0;
  db.result = { error: null };
});

describe("reopenPeriod", () => {
  it("refuses an accountant's reopen with the owner-only message, and shows nothing from the database", async () => {
    // reopen_wage_period answers 42501 to anyone who is not the owner (ADR-035 D12).
    db.result = { error: NOT_PERMITTED };
    const url = await target(() => reopenPeriod(reopen()));
    expect(url).toBe(`${BACK}&error=wage_forbidden`);
    expect(url).not.toContain("permitted");
    expect(messageFor("wage_forbidden")).toContain("only an owner can reopen a locked period");
    expect(db.revalidated).toEqual([]);
  });

  it("refuses a reopen with no reason, or one over 500 characters, and makes no call", async () => {
    for (const reason of ["", "   ", "\n", "a".repeat(501)]) {
      expect(await target(() => reopenPeriod(reopen({ reason })))).toBe(`${BACK}&error=wage_reason`);
    }
    expect(await target(() => reopenPeriod(period()))).toBe(`${BACK}&error=wage_reason`);
    expect(db.calls).toEqual([]);
  });

  it("shows the reason message when the database refuses the reason", async () => {
    db.result = { error: REASON_REQUIRED };
    expect(await target(() => reopenPeriod(reopen()))).toBe(`${BACK}&error=wage_reason`);
  });

  it("sends a bad id to the dashboard without a call", async () => {
    expect(await target(() => reopenPeriod(reopen({ period_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => reopenPeriod(reopen({ org_id: "nope" })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });

  it("reopens through reopen_wage_period with the trimmed reason, and accepts exactly 500 characters", async () => {
    expect(await target(() => reopenPeriod(reopen({ reason: "  wrong rate  ", status: "draft" })))).toBe(SAVED);
    await target(() => reopenPeriod(reopen({ reason: "a".repeat(500) })));
    expect(db.calls).toEqual([
      { kind: "rpc", name: "reopen_wage_period", args: { p_period_id: PERIOD, p_reason: "wrong rate" } },
      { kind: "rpc", name: "reopen_wage_period", args: { p_period_id: PERIOD, p_reason: "a".repeat(500) } }
    ]);
    expect(db.revalidated).toEqual([`/wages/${PERIOD}`, `/wages/${PERIOD}`]);
  });
});

describe("lockPeriod", () => {
  it("refuses a lock before the period has ended, with the state message", async () => {
    // lock_wage_period refuses while end_date is today or later in Asia/Kolkata.
    db.result = { error: NOT_ENDED };
    const url = await target(() => lockPeriod(period()));
    expect(url).toBe(`${BACK}&error=wage_state`);
    expect(url).not.toContain("ended");
    expect(messageFor("wage_state")).toContain("has not ended yet");
    expect(db.revalidated).toEqual([]);
  });

  it("sends a bad id to the dashboard without a call", async () => {
    expect(await target(() => lockPeriod(period({ period_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => lockPeriod(form({ period_id: PERIOD })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });

  it("locks through lock_wage_period with only the period id", async () => {
    expect(await target(() => lockPeriod(period({ status: "locked", locked_by: WORKER })))).toBe(SAVED);
    expect(db.calls).toEqual([{ kind: "rpc", name: "lock_wage_period", args: { p_period_id: PERIOD } }]);
    expect(db.revalidated).toEqual([`/wages/${PERIOD}`]);
  });
});

describe("addAdjustment", () => {
  it("refuses an amount over 10 lakh either way and makes no insert", async () => {
    for (const amount of ["1000000.01", "-1000000.01", "2000000", "-2000000"]) {
      expect(await target(() => addAdjustment(adjust({ amount })))).toBe(`${BACK}&error=wage_amount`);
    }
    expect(db.calls).toEqual([]);
  });

  it("refuses an adjustment with no reason, or one over 500 characters, and makes no insert", async () => {
    for (const reason of ["", "  ", "a".repeat(501)]) {
      expect(await target(() => addAdjustment(adjust({ reason })))).toBe(`${BACK}&error=wage_reason`);
    }
    expect(await target(() => addAdjustment(period({ worker_id: WORKER, amount: "500" })))).toBe(`${BACK}&error=wage_reason`);
    expect(db.calls).toEqual([]);
  });

  it("refuses an adjustment on a locked period with the state message", async () => {
    // wage_adjustments_locked_guard raises 55000 on an insert into a locked period.
    db.result = { error: LOCKED };
    const url = await target(() => addAdjustment(adjust()));
    expect(url).toBe(`${BACK}&error=wage_state`);
    expect(url).not.toContain("locked");
    expect(messageFor("wage_state")).toContain("The period is locked");
    expect(db.revalidated).toEqual([]);
  });

  it("sends a bad period to the dashboard and a bad worker back to the period, without an insert", async () => {
    expect(await target(() => addAdjustment(adjust({ period_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => addAdjustment(adjust({ worker_id: "nope" })))).toBe(BACK);
    expect(await target(() => addAdjustment(period({ amount: "500", reason: "r" })))).toBe(BACK);
    expect(db.calls).toEqual([]);
  });

  it("inserts exactly the five columns, with the amount as a number and the trimmed reason", async () => {
    const extra = { status: "approved", created_by: WORKER, line_total: "9" };
    expect(await target(() => addAdjustment(adjust({ amount: " -250.50 ", reason: "  advance  ", ...extra })))).toBe(SAVED);
    expect(db.calls).toEqual([
      {
        kind: "insert",
        name: "wage_adjustments",
        args: { org_id: ORG, period_id: PERIOD, worker_id: WORKER, amount: -250.5, reason: "advance" }
      }
    ]);
    expect(db.revalidated).toEqual([`/wages/${PERIOD}`]);
  });

  it("accepts exactly 10 lakh either way", async () => {
    expect(await target(() => addAdjustment(adjust({ amount: "1000000" })))).toBe(SAVED);
    expect(await target(() => addAdjustment(adjust({ amount: "-1000000" })))).toBe(SAVED);
    expect(db.calls.map((c) => c.args.amount)).toEqual([1_000_000, -1_000_000]);
  });
});

describe("calculatePeriod", () => {
  it("sends a bad id to the dashboard without a call", async () => {
    expect(await target(() => calculatePeriod(period({ period_id: "nope" })))).toBe("/dashboard");
    expect(await target(() => calculatePeriod(period({ org_id: "" })))).toBe("/dashboard");
    expect(db.calls).toEqual([]);
  });

  it("shows a fixed message chosen by SQLSTATE, and nothing else from the database", async () => {
    const run = async (error: { code?: string; message?: string }) => {
      db.result = { error };
      return target(() => calculatePeriod(period()));
    };
    expect(await run(NOT_PERMITTED)).toBe(`${BACK}&error=wage_forbidden`);
    expect(await run(LOCKED)).toBe(`${BACK}&error=wage_state`);
    expect(await run({ code: "XX000", message: "internal" })).toBe(`${BACK}&error=generic`);
    expect(await run({})).toBe(`${BACK}&error=generic`);
    expect(db.revalidated).toEqual([]);
  });

  it("calculates through calculate_wage_period with only the period id", async () => {
    expect(await target(() => calculatePeriod(period()))).toBe(SAVED);
    expect(db.calls).toEqual([{ kind: "rpc", name: "calculate_wage_period", args: { p_period_id: PERIOD } }]);
    expect(db.revalidated).toEqual([`/wages/${PERIOD}`]);
  });
});

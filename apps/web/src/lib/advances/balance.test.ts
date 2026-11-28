import { describe, expect, it } from "vitest";
import { balanceRows } from "./balance";

const adv = (worker_id: string, amount_paise: number, reverses_id: string | null = null) => ({ worker_id, amount_paise, reverses_id });

describe("balanceRows", () => {
  it("takes the advances off what the worker earned", () => {
    const { rows, otherPaise } = balanceRows([{ worker_id: "w1", total_amount: 3200 }], [adv("w1", 50000), adv("w1", 20000)]);
    expect(rows).toEqual([{ worker_id: "w1", earned_paise: 320000, advance_paise: 70000, left_paise: 250000 }]);
    expect(otherPaise).toBe(0);
  });

  it("takes a cancelled advance back off the total", () => {
    const { rows } = balanceRows([{ worker_id: "w1", total_amount: 1000 }], [adv("w1", 30000), adv("w1", 30000, "id-1")]);
    expect(rows[0]).toMatchObject({ advance_paise: 0, left_paise: 100000 });
  });

  it("leaves a negative balance when the advances are more than the earnings", () => {
    const { rows } = balanceRows([{ worker_id: "w1", total_amount: 100.5 }], [adv("w1", 20000)]);
    expect(rows[0]?.left_paise).toBe(-9950);
  });

  it("keeps a worker with no advance at zero", () => {
    expect(balanceRows([{ worker_id: "w1", total_amount: 10 }], []).rows[0]).toMatchObject({ advance_paise: 0, left_paise: 1000 });
  });

  it("counts advances to a worker with no wage line as other", () => {
    const { rows, otherPaise } = balanceRows([{ worker_id: "w1", total_amount: 10 }], [adv("w2", 40000), adv("w2", 10000, "id-2")]);
    expect(rows).toHaveLength(1);
    expect(otherPaise).toBe(30000);
  });
});

import { toPaise } from "@/lib/wages/summary";
import type { AdvanceRow } from "./rows";

export type BalanceRow = { worker_id: string; earned_paise: number; advance_paise: number; left_paise: number };

/**
 * What each worker earned in a period, the advances paid in it (a cancellation takes
 * its amount off), and what is left. `otherPaise` is the net advance paid to workers
 * who have no wage line in the period, so no money is dropped from view.
 */
export function balanceRows(
  wages: readonly { worker_id: string; total_amount: number }[],
  advances: readonly Pick<AdvanceRow, "worker_id" | "amount_paise" | "reverses_id">[]
): { rows: BalanceRow[]; otherPaise: number } {
  const paid = new Map<string, number>();
  for (const a of advances) {
    paid.set(a.worker_id, (paid.get(a.worker_id) ?? 0) + (a.reverses_id === null ? a.amount_paise : -a.amount_paise));
  }
  const rows = wages.map((w) => {
    const earned = toPaise(w.total_amount);
    const advance = paid.get(w.worker_id) ?? 0;
    paid.delete(w.worker_id);
    return { worker_id: w.worker_id, earned_paise: earned, advance_paise: advance, left_paise: earned - advance };
  });
  return { rows, otherPaise: [...paid.values()].reduce((s, n) => s + n, 0) };
}

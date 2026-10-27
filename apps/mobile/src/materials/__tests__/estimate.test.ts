import type { OutboxStatus } from '../../sync/entities';
import { estimateBalance, countsTowardEstimate, type StoredMovement } from '../estimate';
import type { Movement } from '../movement';

const MATERIAL = '0a0a0a0a-0000-4000-8000-0000000000a1';
const PULLED = '2026-10-20T08:00:00.000Z';
const BEFORE = '2026-10-20T07:59:59.000Z';
const AFTER = '2026-10-20T08:00:01.000Z';

let n = 0;
function stored(
  kind: Movement['kind'],
  quantityMilli: number,
  status: OutboxStatus,
  updatedAt: string,
  reason: string | null = null,
): StoredMovement {
  n += 1;
  return {
    recordId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    movement: { materialId: MATERIAL, kind, quantityMilli, occurredOn: '2026-10-20', reason: kind === 'adjustment' ? 'r' : null },
    status,
    reason,
    updatedAt,
  };
}

describe('estimateBalance: the server balance plus what the server balance does not hold yet', () => {
  it('is the server balance when the user has recorded nothing', () => {
    expect(estimateBalance(27500, PULLED, [])).toEqual({ estimateMilli: 27500, unsent: 0 });
  });

  it('adds receipts and subtracts usage that are not sent yet, in every unsent status', () => {
    for (const status of ['pending', 'syncing', 'failed'] as const) {
      const got = estimateBalance(40000, PULLED, [stored('usage', 12500, status, BEFORE), stored('receipt', 5000, status, BEFORE)]);
      expect(got).toEqual({ estimateMilli: 40000 - 12500 + 5000, unsent: 2 });
    }
  });

  it("adds an adjustment's own sign", () => {
    const got = estimateBalance(10000, PULLED, [
      stored('adjustment', -2000, 'pending', BEFORE),
      stored('adjustment', 500, 'pending', BEFORE),
    ]);
    expect(got.estimateMilli).toBe(8500);
  });

  it('does not count a movement the server refused or kept its own version of', () => {
    const got = estimateBalance(10000, PULLED, [
      stored('usage', 3000, 'rejected', BEFORE, 'permission_denied'),
      stored('usage', 3000, 'conflict', BEFORE, 'duplicate'),
    ]);
    expect(got).toEqual({ estimateMilli: 10000, unsent: 0 });
  });

  describe('a synced movement (Option B on #82)', () => {
    it('is still added until a pull has happened after it, so the estimate does not dip after a good sync', () => {
      const m = stored('usage', 4000, 'synced', AFTER); // accepted after the balance was pulled
      expect(estimateBalance(20000, PULLED, [m])).toEqual({ estimateMilli: 16000, unsent: 0 });
    });

    it('stops being added once the pulled balance already holds it', () => {
      const m = stored('usage', 4000, 'synced', BEFORE); // accepted before the pull
      expect(estimateBalance(16000, PULLED, [m])).toEqual({ estimateMilli: 16000, unsent: 0 });
    });

    it('counts a movement accepted at the very instant of the pull as held by it', () => {
      expect(countsTowardEstimate(stored('usage', 1, 'synced', PULLED), PULLED)).toBe(false);
    });

    it('is not added at all when no pull time is known, since there is no balance to be above', () => {
      expect(countsTowardEstimate(stored('usage', 1, 'synced', AFTER), null)).toBe(false);
    });
  });

  it('can go below zero, which is a warning and never an error (ADR-015)', () => {
    expect(estimateBalance(1000, PULLED, [stored('usage', 5000, 'pending', BEFORE)]).estimateMilli).toBe(-4000);
  });

  it('is exact in thousandths over many movements', () => {
    const many = Array.from({ length: 1000 }, () => stored('usage', 1, 'pending', BEFORE));
    expect(estimateBalance(5000, PULLED, many).estimateMilli).toBe(4000);
  });
});

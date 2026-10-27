// The balance the phone shows: the server's balance at the last pull, plus what that
// balance does not hold yet. Owner: Materials (Nikhil). Issue #82.
//
// It is an estimate, and the screen says so. Another supervisor's movements, and
// anything the server has not been told about, are not in it.

import type { OutboxStatus } from '../sync/entities';
import { signedMilli, type Movement } from './movement';

/** One movement of this user's outbox, with where it stands with the server. */
export interface StoredMovement {
  recordId: string;
  movement: Movement;
  status: OutboxStatus;
  reason: string | null;
  updatedAt: string;
}

const UNSENT: readonly OutboxStatus[] = ['pending', 'syncing', 'failed'];

/** Not yet told to the server: still waiting, being sent, or failed and due a retry. */
export const isUnsent = (stored: StoredMovement): boolean => UNSENT.includes(stored.status);

/**
 * Whether the server balance, pulled at `refreshedAt`, is missing this movement.
 * Unsent ones always are. A synced one is until a pull has happened after it was
 * accepted, so the estimate does not dip after a good sync (#82, Option B). One
 * accepted at the very instant of the pull is taken as held by it. Refused or
 * conflicting movements never reached the ledger.
 */
export function countsTowardEstimate(stored: StoredMovement, refreshedAt: string | null): boolean {
  if (isUnsent(stored)) return true;
  if (stored.status !== 'synced' || refreshedAt === null) return false;
  const synced = Date.parse(stored.updatedAt);
  const pulled = Date.parse(refreshedAt);
  return Number.isFinite(synced) && Number.isFinite(pulled) && synced > pulled;
}

export interface Estimate {
  estimateMilli: number;
  /** How many of this material's movements the server has not been told about. */
  unsent: number;
}

export function estimateBalance(
  serverBalanceMilli: number,
  refreshedAt: string | null,
  movements: readonly StoredMovement[],
): Estimate {
  let estimateMilli = serverBalanceMilli;
  let unsent = 0;
  for (const stored of movements) {
    if (!countsTowardEstimate(stored, refreshedAt)) continue;
    estimateMilli += signedMilli(stored.movement);
    if (isUnsent(stored)) unsent += 1;
  }
  return { estimateMilli, unsent };
}

// Sign-out for the field app: end the session, then take the user's offline
// copy off the phone. Owner: Identity (Ishant), added by Offline Sync (#49, ADR-023).
//
// The mirrors of sites, materials and roster are already unreadable to the next
// user, but they stay on disk until cleared, and on a shared phone the previous
// user's site addresses and worker names should not.

import type { DeviceDb } from '../db/device-db';
import { clearMirrors } from '../sync/pull';

/**
 * Signs out and, once that has worked, clears the mirrors. A failed sign-out
 * leaves the copy alone, since the user is still signed in. A copy that cannot
 * be cleared never fails the sign-out, which must work with no connection and no
 * working database (ADR-020); the next pull replaces the whole copy anyway. The
 * outbox is never touched: unsent records wait for their author.
 */
export async function signOutAndClearMirrors(
  signOut: () => Promise<void>,
  openDb: () => Promise<DeviceDb>,
): Promise<void> {
  await signOut();
  try {
    await clearMirrors(await openDb());
  } catch {
    // Left in place; see above.
  }
}

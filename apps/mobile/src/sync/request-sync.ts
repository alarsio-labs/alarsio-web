// The running sync engine lives in the Home screen, out of reach of the capture
// screens. Home registers it here, so a save can ask for a sync right away (#79).
import type { SyncHandle } from './engine';

type ActiveSync = Pick<SyncHandle, 'requestSync' | 'retryNow'>;

let active: ActiveSync | null = null;

export function setActiveSync(handle: ActiveSync | null): void {
  active = handle;
}

/** Ask the running engine to sync soon. Does nothing when none is running. */
export function requestSyncSoon(): void {
  active?.requestSync();
}

/** Push and pull now, for pull-to-refresh. Resolves when done; does nothing when no engine is running. */
export async function syncNowSoon(): Promise<void> {
  await active?.retryNow().catch(() => undefined);
}

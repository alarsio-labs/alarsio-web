// The running sync engine lives in the Home screen, out of reach of the capture
// screens. Home registers it here, so a save can ask for a sync right away (#79).
import type { SyncHandle } from './engine';

let active: Pick<SyncHandle, 'requestSync'> | null = null;

export function setActiveSync(handle: Pick<SyncHandle, 'requestSync'> | null): void {
  active = handle;
}

/** Ask the running engine to sync soon. Does nothing when none is running. */
export function requestSyncSoon(): void {
  active?.requestSync();
}

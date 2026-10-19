// The app's one device database for this app session, shared by the home
// screen and sign-out. openDeviceDb runs recoverInterrupted, which must run
// once per app session (Nikhil, #67), so this memoises it.

import type { DeviceDb } from '../db/device-db';
import { openDeviceDb } from '../db/open-device-db';

let dbPromise: Promise<DeviceDb> | null = null;

export function openAppDb(): Promise<DeviceDb> {
  dbPromise ??= openDeviceDb().catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

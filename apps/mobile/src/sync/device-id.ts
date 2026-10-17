// A stable id for this install, sent with every push for logging only.
// It is never identity: the server knows the caller from auth.uid() (ADR-009).
// Owner: Offline Sync (Nikhil). Issue #47.

import type { DeviceDb } from '../db/device-db';
import { newRecordId } from './outbox';

const KEY = 'device_id';

export async function getDeviceId(db: DeviceDb): Promise<string> {
  const [row] = await db.all<{ value: string }>('select value from device_settings where key = ?', [KEY]);
  if (row) return row.value;

  // Insert-or-ignore, then read back, so two callers racing on first start
  // still agree on one id.
  await db.run('insert or ignore into device_settings (key, value) values (?, ?)', [KEY, newRecordId()]);
  const [stored] = await db.all<{ value: string }>('select value from device_settings where key = ?', [KEY]);
  if (!stored) throw new Error('device id could not be stored');
  return stored.value;
}

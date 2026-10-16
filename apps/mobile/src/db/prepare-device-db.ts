// Settings every connection needs, then the migrations.
// Owner: Offline Sync (Nikhil). Issue #14.

import type { DeviceDb } from './device-db';
import { runMigrations, type DeviceMigration } from './run-migrations';

export async function prepareDeviceDb(
  db: DeviceDb,
  migrations: readonly DeviceMigration[],
): Promise<void> {
  // SQLite leaves foreign keys off unless each connection turns them on. This must
  // run outside a transaction, where SQLite ignores it.
  await db.exec('PRAGMA foreign_keys = ON');
  // WAL lets a read run while a write is in progress, as the Expo docs recommend.
  await db.exec('PRAGMA journal_mode = WAL');
  await runMigrations(db, migrations);
}

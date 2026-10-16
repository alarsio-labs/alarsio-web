// Opens the app's on-device database through expo-sqlite.
// Owner: Offline Sync (Nikhil). Issue #14.

import * as SQLite from 'expo-sqlite';

import { serialTransactions, type DeviceDb } from './device-db';
import { deviceMigrations } from './migrations';
import { prepareDeviceDb } from './prepare-device-db';

export const DEVICE_DB_NAME = 'alarsio.db';

export async function openDeviceDb(): Promise<DeviceDb> {
  const native = await SQLite.openDatabaseAsync(DEVICE_DB_NAME);
  const db = wrapExpoDatabase(native);
  await prepareDeviceDb(db, deviceMigrations);
  return db;
}

function wrapExpoDatabase(native: SQLite.SQLiteDatabase): DeviceDb {
  const exec = (sql: string) => native.execAsync(sql);
  return {
    exec,
    async run(sql, params = []) {
      const result = await native.runAsync(sql, ...params);
      return { changes: result.changes };
    },
    all: (sql, params = []) => native.getAllAsync(sql, ...params),
    // Our own BEGIN/COMMIT rather than withTransactionAsync, so the app and the
    // sql.js tests share one implementation.
    transaction: serialTransactions(exec),
  };
}

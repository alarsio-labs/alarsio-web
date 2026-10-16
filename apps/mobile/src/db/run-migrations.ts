// Versioned migrations for the on-device database, keyed on PRAGMA user_version.
// Owner: Offline Sync (Nikhil). Issue #14.

import type { DeviceDb } from './device-db';

export interface DeviceMigration {
  /** 1 for the first migration, then 2, 3 … with no gaps. Never renumber. */
  readonly version: number;
  /** Short description, for error messages. */
  readonly name: string;
  /** Fixed SQL. Must not contain BEGIN or COMMIT: the runner wraps it in a transaction. */
  readonly sql: string;
}

/**
 * Applies every migration newer than the database's `user_version`, in order, each
 * in its own transaction together with the version bump. A migration that throws is
 * rolled back, and the version stays at the last one that succeeded.
 *
 * Returns how many migrations were applied.
 */
export async function runMigrations(
  db: DeviceDb,
  migrations: readonly DeviceMigration[],
): Promise<number> {
  assertWellFormed(migrations);

  const current = await readUserVersion(db);
  const latest = migrations.length;
  if (current > latest) {
    throw new Error(
      `device database is at version ${current}, newer than this app knows (${latest})`,
    );
  }

  let applied = 0;
  for (const migration of migrations) {
    if (migration.version <= current) continue;

    try {
      await db.transaction(async () => {
        await db.exec(migration.sql);
        // Safe to interpolate: assertWellFormed checked it is a positive integer.
        await db.exec(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `device migration ${migration.version} (${migration.name}) failed: ${reason}`,
      );
    }
    applied += 1;
  }
  return applied;
}

export async function readUserVersion(db: DeviceDb): Promise<number> {
  const rows = await db.all<{ user_version: number }>('PRAGMA user_version');
  return rows[0]?.user_version ?? 0;
}

function assertWellFormed(migrations: readonly DeviceMigration[]): void {
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (!Number.isInteger(migration.version) || migration.version !== expected) {
      throw new Error(
        `device migrations must be numbered 1, 2, 3 … with no gaps: ` +
          `position ${expected} has version ${migration.version}`,
      );
    }
  });
}

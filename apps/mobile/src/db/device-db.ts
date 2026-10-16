// The on-device SQLite database, behind a small interface.
// Owner: Offline Sync (Nikhil). Issue #14.
//
// The app implements this with expo-sqlite (open-device-db.ts). Tests implement it
// with in-memory sql.js (test-support/sqljs-device-db.ts), so our SQL runs for real
// in Jest instead of against a mock.

/** A value SQLite can store. Booleans are not allowed: store 0 or 1. */
export type SqlValue = string | number | null | Uint8Array;

export interface DeviceDb {
  /**
   * Runs one or more statements with no parameters. Use only for fixed SQL such as
   * migrations, never for anything built from user input.
   */
  exec(sql: string): Promise<void>;

  /** Runs one write statement with positional (`?`) parameters. */
  run(sql: string, params?: readonly SqlValue[]): Promise<{ changes: number }>;

  /** Runs one query with positional (`?`) parameters and returns every row. */
  all<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row[]>;

  /**
   * Runs `fn` between BEGIN and COMMIT. If `fn` throws, rolls back and rethrows.
   * Transactions on one database run one after another, never interleaved.
   */
  transaction(fn: () => Promise<void>): Promise<void>;
}

/**
 * Builds `DeviceDb.transaction` on top of `exec`. Both adapters use it, so a
 * transaction behaves the same in the app and in tests.
 *
 * SQLite has one transaction per connection, so a second transaction waits for the
 * first instead of failing with "cannot start a transaction within a transaction".
 */
export function serialTransactions(
  exec: (sql: string) => Promise<void>,
): (fn: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();

  return (fn) => {
    const result = tail.then(async () => {
      await exec('BEGIN IMMEDIATE');
      try {
        await fn();
        await exec('COMMIT');
      } catch (error) {
        await exec('ROLLBACK');
        throw error;
      }
    });
    // The next transaction waits for this one whether it committed or not.
    tail = result.catch(() => undefined);
    return result;
  };
}

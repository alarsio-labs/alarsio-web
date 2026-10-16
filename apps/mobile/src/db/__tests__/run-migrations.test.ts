import type { DeviceDb } from '../device-db';
import { readUserVersion, runMigrations, type DeviceMigration } from '../run-migrations';
import { openTestDeviceDb } from '../test-support/sqljs-device-db';

const createA: DeviceMigration = {
  version: 1,
  name: 'create a',
  sql: 'create table a (id text primary key);',
};
const createB: DeviceMigration = {
  version: 2,
  name: 'create b',
  sql: 'create table b (id text primary key);',
};

async function tableNames(db: DeviceDb): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    "select name from sqlite_master where type = 'table' order by name",
  );
  return rows.map((row) => row.name);
}

describe('runMigrations', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
  });

  it('applies every migration in order and records the version', async () => {
    const applied = await runMigrations(db, [createA, createB]);

    expect(applied).toBe(2);
    expect(await readUserVersion(db)).toBe(2);
    expect(await tableNames(db)).toEqual(['a', 'b']);
  });

  it('applies nothing the second time', async () => {
    await runMigrations(db, [createA, createB]);

    const appliedAgain = await runMigrations(db, [createA, createB]);

    expect(appliedAgain).toBe(0);
    expect(await readUserVersion(db)).toBe(2);
  });

  it('applies only the new migration when the app ships one more', async () => {
    await runMigrations(db, [createA]);

    const applied = await runMigrations(db, [createA, createB]);

    expect(applied).toBe(1);
    expect(await readUserVersion(db)).toBe(2);
  });

  it('rolls back a failing migration and keeps the last good version', async () => {
    // The first statement succeeds, the second is not SQL. Both must be undone.
    const broken: DeviceMigration = {
      version: 2,
      name: 'broken',
      sql: 'create table b (id text primary key); this is not sql;',
    };

    await expect(runMigrations(db, [createA, broken])).rejects.toThrow(
      /device migration 2 \(broken\) failed/,
    );

    expect(await readUserVersion(db)).toBe(1);
    expect(await tableNames(db)).toEqual(['a']);
  });

  it('refuses a gap in the numbering and applies nothing', async () => {
    const gap: DeviceMigration = { ...createB, version: 3 };

    await expect(runMigrations(db, [createA, gap])).rejects.toThrow(/no gaps/);

    expect(await readUserVersion(db)).toBe(0);
    expect(await tableNames(db)).toEqual([]);
  });

  it('refuses a duplicate version', async () => {
    await expect(runMigrations(db, [createA, { ...createB, version: 1 }])).rejects.toThrow(
      /no gaps/,
    );
  });

  it('refuses a list that does not start at 1', async () => {
    await expect(runMigrations(db, [{ ...createA, version: 0 }])).rejects.toThrow(/no gaps/);
  });

  it('refuses a database newer than the app', async () => {
    await db.exec('PRAGMA user_version = 5');

    await expect(runMigrations(db, [createA])).rejects.toThrow(/newer than this app/);
    expect(await tableNames(db)).toEqual([]);
  });

  it('accepts an empty list on a new database', async () => {
    expect(await runMigrations(db, [])).toBe(0);
    expect(await readUserVersion(db)).toBe(0);
  });
});

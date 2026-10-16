import { prepareDeviceDb } from '../prepare-device-db';
import { openTestDeviceDb } from '../test-support/sqljs-device-db';

describe('prepareDeviceDb', () => {
  it('turns foreign keys on, so a row pointing at nothing is refused', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, [
      {
        version: 1,
        name: 'parent and child',
        sql: `
          create table parent (id text primary key);
          create table child (id text primary key, parent_id text not null references parent (id));
        `,
      },
    ]);

    const [pragma] = await db.all<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(pragma?.foreign_keys).toBe(1);

    await expect(
      db.run('insert into child (id, parent_id) values (?, ?)', ['c1', 'no-such-parent']),
    ).rejects.toThrow(/FOREIGN KEY/);
    expect(await db.all('select * from child')).toEqual([]);
  });
});

describe('DeviceDb.transaction', () => {
  it('commits when the work succeeds', async () => {
    const db = await openTestDeviceDb();
    await db.exec('create table t (id text primary key)');

    await db.transaction(async () => {
      await db.run('insert into t (id) values (?)', ['x']);
    });

    expect(await db.all('select id from t')).toEqual([{ id: 'x' }]);
  });

  it('rolls back and rethrows when the work throws', async () => {
    const db = await openTestDeviceDb();
    await db.exec('create table t (id text primary key)');

    await expect(
      db.transaction(async () => {
        await db.run('insert into t (id) values (?)', ['x']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await db.all('select id from t')).toEqual([]);
  });

  it('runs two transactions one after the other instead of failing', async () => {
    const db = await openTestDeviceDb();
    await db.exec('create table t (id text primary key)');
    const order: string[] = [];

    await Promise.all([
      db.transaction(async () => {
        order.push('first:start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        await db.run('insert into t (id) values (?)', ['first']);
        order.push('first:end');
      }),
      db.transaction(async () => {
        order.push('second:start');
        await db.run('insert into t (id) values (?)', ['second']);
        order.push('second:end');
      }),
    ]);

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(await db.all('select id from t order by id')).toEqual([
      { id: 'first' },
      { id: 'second' },
    ]);
  });

  it('still runs the next transaction after one fails', async () => {
    const db = await openTestDeviceDb();
    await db.exec('create table t (id text primary key)');

    const failing = db.transaction(async () => {
      throw new Error('first fails');
    });
    const next = db.transaction(async () => {
      await db.run('insert into t (id) values (?)', ['ok']);
    });

    await expect(failing).rejects.toThrow('first fails');
    await next;
    expect(await db.all('select id from t')).toEqual([{ id: 'ok' }]);
  });
});

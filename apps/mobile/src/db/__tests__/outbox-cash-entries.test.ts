import { enqueue, listRecords } from '../../sync/outbox';
import { deviceMigrations } from '../migrations';
import { prepareDeviceDb } from '../prepare-device-db';
import { openTestDeviceDb } from '../test-support/sqljs-device-db';

const USER = '11111111-0000-4000-8000-00000000000a';
const ID_1 = '22222222-0000-4000-8000-000000000001';
const ID_2 = '22222222-0000-4000-8000-000000000002';
const ID_3 = '22222222-0000-4000-8000-000000000003';
const SITE = '33333333-0000-4000-8000-000000000001';

describe('device migrations 14 and 15 (cash entries)', () => {
  it('keeps every outbox row, its send order and its author on a phone from version 13', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations.slice(0, 13));
    await enqueue(db, { entity: 'site_visits', recordId: ID_1, authorId: USER, payload: { a: 1 } });
    await enqueue(db, { entity: 'worker_advances', recordId: ID_2, authorId: USER, payload: { b: 2 } });
    await db.run(`update outbox set status = 'rejected', reason = 'permission_denied' where record_id = ?`, [ID_2]);
    const before = await db.all('select * from outbox order by seq');

    await prepareDeviceDb(db, deviceMigrations);

    expect(await db.all('select * from outbox order by seq')).toEqual(before);
    const indexes = await db.all<{ name: string }>(`select name from sqlite_master where type = 'index' and tbl_name = 'outbox'`);
    expect(indexes.map((i) => i.name)).toEqual(expect.arrayContaining(['outbox_status_seq', 'outbox_author_status_seq']));
  });

  it('then accepts a cash entry, and sends it after the older rows', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations.slice(0, 13));
    await enqueue(db, { entity: 'site_visits', recordId: ID_1, authorId: USER, payload: {} });
    await prepareDeviceDb(db, deviceMigrations);

    await enqueue(db, { entity: 'cash_entries', recordId: ID_3, authorId: USER, payload: { amount_paise: 50000 } });

    const rows = await db.all<{ entity: string }>('select entity from outbox order by seq');
    expect(rows.map((r) => r.entity)).toEqual(['site_visits', 'cash_entries']);
    expect((await listRecords(db, USER, 'cash_entries')).map((r) => r.recordId)).toEqual([ID_3]);
  });

  it('refuses a cash entry on a phone still on version 13', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations.slice(0, 13));

    await expect(
      enqueue(db, { entity: 'cash_entries', recordId: ID_3, authorId: USER, payload: {} }),
    ).rejects.toThrow(/CHECK/);
  });

  it('adds a mirror that takes an entry and refuses a bad category or amount', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    const insert = (category: string, amount: number) =>
      db.run(
        `insert into mirror_cash_entries (id, site_id, entry_date, category, amount_paise) values (?, ?, '2026-11-20', ?, ?)`,
        [ID_1, SITE, category, amount],
      );

    await insert('food', 12500);
    expect(await db.all('select id from mirror_cash_entries')).toEqual([{ id: ID_1 }]);
    await expect(insert('bribes', 100)).rejects.toThrow(/CHECK|constraint/i);
    await expect(insert('food', 0)).rejects.toThrow(/CHECK|constraint/i);
  });
});

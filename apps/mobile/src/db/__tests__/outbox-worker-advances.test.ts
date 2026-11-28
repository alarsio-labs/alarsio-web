import { enqueue, listRecords } from '../../sync/outbox';
import { deviceMigrations } from '../migrations';
import { prepareDeviceDb } from '../prepare-device-db';
import { openTestDeviceDb } from '../test-support/sqljs-device-db';

const USER = '11111111-0000-4000-8000-00000000000a';
const ID_1 = '22222222-0000-4000-8000-000000000001';
const ID_2 = '22222222-0000-4000-8000-000000000002';
const ID_3 = '22222222-0000-4000-8000-000000000003';

describe('device migration 11 (outbox worker advances)', () => {
  it('keeps every row, its send order and its author on a phone from version 10', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations.slice(0, 10));
    await enqueue(db, { entity: 'site_visits', recordId: ID_1, authorId: USER, payload: { a: 1 } });
    await enqueue(db, { entity: 'material_transactions', recordId: ID_2, authorId: USER, payload: { b: 2 } });
    await db.run(`update outbox set status = 'rejected', reason = 'permission_denied' where record_id = ?`, [ID_2]);
    const before = await db.all('select * from outbox order by seq');

    await prepareDeviceDb(db, deviceMigrations);

    expect(await db.all('select * from outbox order by seq')).toEqual(before);
    const indexes = await db.all<{ name: string }>(`select name from sqlite_master where type = 'index' and tbl_name = 'outbox'`);
    expect(indexes.map((i) => i.name)).toEqual(expect.arrayContaining(['outbox_status_seq', 'outbox_author_status_seq']));
  });

  it('then accepts an advance, and sends it after the older rows', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations.slice(0, 10));
    await enqueue(db, { entity: 'site_visits', recordId: ID_1, authorId: USER, payload: {} });
    await prepareDeviceDb(db, deviceMigrations);

    await enqueue(db, { entity: 'worker_advances', recordId: ID_3, authorId: USER, payload: { amount_paise: 50000 } });

    const rows = await db.all<{ entity: string }>('select entity from outbox order by seq');
    expect(rows.map((r) => r.entity)).toEqual(['site_visits', 'worker_advances']);
    expect((await listRecords(db, USER, 'worker_advances')).map((r) => r.recordId)).toEqual([ID_3]);
  });

  it('refuses an advance on a phone still on version 10', async () => {
    const db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations.slice(0, 10));

    await expect(
      enqueue(db, { entity: 'worker_advances', recordId: ID_3, authorId: USER, payload: {} }),
    ).rejects.toThrow(/CHECK/);
  });
});

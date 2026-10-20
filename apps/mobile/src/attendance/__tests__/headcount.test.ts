import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { applyVerdicts, claimBatch, enqueue } from '../../sync/outbox';
import { readHeadcount } from '../headcount';

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = '51000000-0000-4000-8000-000000000001';
const SITE_2 = '51000000-0000-4000-8000-000000000002';
const DAY = '2026-10-20';
const NOW = new Date('2026-10-20T06:00:00.000Z');

let seq = 0;
const recordId = () => `dddddddd-0000-4000-8000-${String((seq += 1)).padStart(12, '0')}`;
const worker = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** An entry as Attendance's sync handler reads it (sync_attendance_entries). */
function entry(n: number, status: string, over: Record<string, unknown> = {}) {
  return {
    org_id: ORG,
    site_id: SITE_1,
    attendance_date: DAY,
    worker_id: worker(n),
    status,
    overtime_hours: 0,
    note: null,
    ...over,
  };
}

async function save(db: DeviceDb, payload: Record<string, unknown>, authorId = USER_A): Promise<string> {
  const id = recordId();
  await enqueue(db, { entity: 'attendance_entries', recordId: id, authorId, payload }, NOW);
  return id;
}

describe('readHeadcount (#109)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it('counts present and half-day workers, and says how many were half a day', async () => {
    await save(db, entry(1, 'present'));
    await save(db, entry(2, 'present'));
    await save(db, entry(3, 'half_day'));
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toEqual({ onSite: 3, halfDay: 1 });
  });

  it('does not count absent or leave', async () => {
    await save(db, entry(1, 'present'));
    await save(db, entry(2, 'absent'));
    await save(db, entry(3, 'leave'));
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toEqual({ onSite: 1, halfDay: 0 });
  });

  it('answers zero, not nothing, when attendance was taken and nobody came', async () => {
    await save(db, entry(1, 'absent'));
    await save(db, entry(2, 'leave'));
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toEqual({ onSite: 0, halfDay: 0 });
  });

  it('answers nothing when the phone holds no entry for that site and day', async () => {
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toBeNull();
  });

  it('counts a worker once, by their newest entry', async () => {
    await save(db, entry(1, 'present'));
    await save(db, entry(1, 'absent'));
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toEqual({ onSite: 0, halfDay: 0 });
  });

  it('reads only the signed-in user’s records, never another user’s (ADR-020)', async () => {
    await save(db, entry(1, 'present'), USER_B);
    await save(db, entry(2, 'present'), USER_B);
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toBeNull();
    expect(await readHeadcount(db, USER_B, SITE_1, DAY)).toEqual({ onSite: 2, halfDay: 0 });
  });

  it('answers nothing without a user', async () => {
    await save(db, entry(1, 'present'));
    expect(await readHeadcount(db, '', SITE_1, DAY)).toBeNull();
  });

  it('ignores another site and another day', async () => {
    await save(db, entry(1, 'present', { site_id: SITE_2 }));
    await save(db, entry(2, 'present', { attendance_date: '2026-10-19' }));
    await save(db, entry(3, 'present'));
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toEqual({ onSite: 1, halfDay: 0 });
  });

  it('matches the site id whatever its case', async () => {
    await save(db, entry(1, 'present'));
    expect(await readHeadcount(db, USER_A, SITE_1.toUpperCase(), DAY)).toEqual({ onSite: 1, halfDay: 0 });
  });

  it('skips an entry the server rejected, since it was never stored', async () => {
    const refused = await save(db, entry(1, 'present'));
    const kept = await save(db, entry(2, 'present'));
    await claimBatch(db, USER_A, NOW);
    await applyVerdicts(
      db,
      [
        { entity: 'attendance_entries', record_id: refused, verdict: 'rejected', reason: 'invalid_input' },
        { entity: 'attendance_entries', record_id: kept, verdict: 'accepted', reason: null },
      ],
      NOW,
    );
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toEqual({ onSite: 1, halfDay: 0 });
  });

  it('skips a record that is not an entry', async () => {
    await save(db, entry(1, 'present', { worker_id: 42 }));
    await save(db, entry(2, 'here'));
    await save(db, { site_id: SITE_1, attendance_date: DAY });
    await save(db, entry(3, 'half_day'));
    expect(await readHeadcount(db, USER_A, SITE_1, DAY)).toEqual({ onSite: 1, halfDay: 1 });
  });
});

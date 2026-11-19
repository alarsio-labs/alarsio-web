import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { readSiteWorkers } from '../../sync/pull';
import { readWorkerMonth } from '../month-store';
import type { Mark } from '../register';
import { saveMark } from '../register-store';

// Issue #234, ADR-053: one worker's month from the month mirror and the outbox.

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `dddddddd-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG };
const W1 = '77777777-0000-4000-8000-000000000001';
const W2 = '77777777-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-19T08:00:00.000Z'); // 19 Nov in India
const mark = (status: Mark['status'], overtimeHours = 0): Mark => ({ status, overtimeHours, note: null });

let n = 0;
async function seedRoster(db: DeviceDb, worker: string, assignedOn = '2026-10-01', unassignedOn: string | null = null) {
  n += 1;
  await db.run(
    `insert into mirror_roster (assignment_id, worker_id, site_id, code, name, trade, assigned_on, unassigned_on)
     values (?, ?, ?, ?, ?, 'mason', ?, ?)`,
    [`aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`, worker, SITE.id, `W${n}`, `Worker ${worker.slice(-1)}`, assignedOn, unassignedOn],
  );
}

async function seedMonth(
  db: DeviceDb,
  row: { worker?: string; date: string; status?: string; overtimeHundredths?: number; dayStatus?: string },
) {
  n += 1;
  await db.run(
    `insert into mirror_month_entries (entry_id, site_id, worker_id, work_date, status, overtime_hundredths, day_status)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`,
      SITE.id,
      row.worker ?? W1,
      row.date,
      row.status ?? 'present',
      row.overtimeHundredths ?? 0,
      row.dayStatus ?? 'open',
    ],
  );
}

describe('worker month store (#234, ADR-053)', () => {
  let db: DeviceDb;
  const month = (m = '2026-11', worker = W1, user = USER_A) => readWorkerMonth(db, user, SITE.id, worker, m, NOW);
  const day = async (date: string, m = date.slice(0, 7)) => (await month(m)).days.find((d) => d.date === date)!;

  beforeEach(async () => {
    n = 0;
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [USER_A, NOW.toISOString()]);
    await seedRoster(db, W1);
  });

  it('lists every date of the month, none marked, none counted absent', async () => {
    const m = await month();
    expect(m.available).toBe(true);
    expect(m.days).toHaveLength(30);
    expect(m.summary).toMatchObject({ present: 0, absent: 0, notMarked: 30, payableDays: 0 });
  });

  it('fills the summary from the mirror, with overtime', async () => {
    await seedMonth(db, { date: '2026-11-10', overtimeHundredths: 250 });
    await seedMonth(db, { date: '2026-11-11', status: 'half_day' });
    await seedMonth(db, { date: '2026-11-12', status: 'leave' });
    await seedMonth(db, { date: '2026-11-13', status: 'absent' });
    await seedMonth(db, { worker: W2, date: '2026-11-14' });

    const m = await month();
    expect(m.summary).toEqual({
      present: 1, halfDays: 1, leave: 1, absent: 1, notMarked: 26, payableDays: 1.5, overtimeHours: 2.5,
    });
    expect((await day('2026-11-10')).mark).toEqual({ status: 'present', overtimeHours: 2.5 });
    expect((await day('2026-11-14')).mark).toBeNull();
  });

  it('shows a mark saved on this phone over the mirror, with its sync state', async () => {
    await seedMonth(db, { date: '2026-11-17', status: 'present' });
    await saveMark(db, USER_A, SITE, '2026-11-17', W1, mark('absent'), NOW);
    await saveMark(db, USER_A, SITE, '2026-11-18', W1, mark('present', 1.5), NOW);

    expect(await day('2026-11-17')).toMatchObject({ mark: { status: 'absent', overtimeHours: 0 }, sync: { status: 'pending' } });
    expect((await day('2026-11-18')).mark).toEqual({ status: 'present', overtimeHours: 1.5 });
    expect((await day('2026-11-16')).sync).toBeNull();
    expect((await month()).summary).toMatchObject({ present: 1, absent: 1, overtimeHours: 1.5 });
  });

  it('keeps one worker\'s saved marks out of another\'s month', async () => {
    await seedRoster(db, W2);
    await saveMark(db, USER_A, SITE, '2026-11-18', W2, mark('present'), NOW);
    expect((await day('2026-11-18')).mark).toBeNull();
  });

  it('locks a day the mirror says is approved, even when this worker has no entry that day', async () => {
    await seedMonth(db, { worker: W2, date: '2026-10-28', dayStatus: 'approved' });
    await seedMonth(db, { date: '2026-10-29', dayStatus: 'open' });

    expect((await day('2026-10-28')).locked).toBe(true);
    expect((await day('2026-10-29')).locked).toBe(false);
    expect((await day('2026-10-30')).locked).toBe(false);
  });

  it('locks a day of the approved-days mirror', async () => {
    await db.run(
      `insert into mirror_approved_days (entry_id, site_id, worker_id, work_date, status, overtime_hundredths, approved_at)
       values ('eeeeeeee-0000-4000-8000-0000000000ff', ?, ?, '2026-11-17', 'present', 0, '2026-11-18T11:00:00+00:00')`,
      [SITE.id, W2],
    );
    expect((await day('2026-11-17')).locked).toBe(true);
  });

  it('blocks dates after tomorrow, and dates outside the worker\'s assignment, both ends counted', async () => {
    await db.run('delete from mirror_roster');
    await seedRoster(db, W1, '2026-11-05', '2026-11-15');

    expect((await day('2026-11-04')).blocked).toBe('not_assigned');
    expect((await day('2026-11-05')).blocked).toBeNull();
    expect((await day('2026-11-15')).blocked).toBeNull();
    expect((await day('2026-11-16')).blocked).toBe('not_assigned');

    await db.run('delete from mirror_roster');
    await seedRoster(db, W1);
    expect((await day('2026-11-20')).blocked).toBeNull();
    expect((await day('2026-11-21')).blocked).toBe('future');
  });

  it('allows a date in any of the worker\'s assignments', async () => {
    await db.run('delete from mirror_roster');
    await seedRoster(db, W1, '2026-11-01', '2026-11-05');
    await seedRoster(db, W1, '2026-11-12');

    expect((await day('2026-11-08')).blocked).toBe('not_assigned');
    expect((await day('2026-11-03')).blocked).toBeNull();
    expect((await day('2026-11-12')).blocked).toBeNull();
  });

  it('holds this month and the one before; an older month is for the web', async () => {
    expect((await month('2026-10')).available).toBe(true);
    const old = await month('2026-09');
    expect(old.available).toBe(false);
    expect(old.days).toEqual([]);
  });

  it('shows nothing from another user\'s phone copy', async () => {
    await seedMonth(db, { date: '2026-11-10' });
    const m = await month('2026-11', W1, USER_B);
    expect(m.summary.present).toBe(0);
    expect(m.days.every((d) => d.mark === null)).toBe(true);
  });

  it('refuses a month that is not well formed', async () => {
    await expect(month('November')).rejects.toThrow('month must be YYYY-MM');
  });

  it('lists the site\'s workers once each, by name', async () => {
    await seedRoster(db, W2);
    await seedRoster(db, W1, '2026-11-12');
    const workers = await readSiteWorkers(db, USER_A, SITE.id);
    expect(workers.map((w) => w.workerId)).toEqual([W1, W2]);
    expect(await readSiteWorkers(db, USER_B, SITE.id)).toEqual([]);
  });
});

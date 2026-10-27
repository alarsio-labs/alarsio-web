import { configure, fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { DayRegisterScreen } from '../DayRegisterScreen';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `cccccccc-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER_A = '11111111-0000-4000-8000-00000000000a';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const W1 = '77777777-0000-4000-8000-000000000001';
const W2 = '77777777-0000-4000-8000-000000000002';
const DATE = '2026-10-20';
const NOW = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST

async function seed(db: DeviceDb, approved: { worker: string; status: string; overtimeHundredths: number }[]) {
  await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [USER_A, NOW.toISOString()]);
  await db.run(
    `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
     values (?, ?, 'Kothrud', 'Pune', 18.52, 73.85, 200, 'active')`,
    [SITE, ORG],
  );
  for (const [i, w] of [W1, W2].entries()) {
    await db.run(
      `insert into mirror_roster (assignment_id, worker_id, site_id, code, name, trade, assigned_on, unassigned_on)
       values (?, ?, ?, ?, ?, 'mason', '2026-10-01', null)`,
      [`aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, w, SITE, `W${i + 1}`, `Worker ${i + 1}`],
    );
  }
  for (const [i, a] of approved.entries()) {
    await db.run(
      `insert into mirror_approved_days (entry_id, site_id, worker_id, work_date, status, overtime_hundredths, approved_at)
       values (?, ?, ?, ?, ?, ?, '2026-10-20T11:00:00+00:00')`,
      [`eeeeeeee-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, SITE, a.worker, DATE, a.status, a.overtimeHundredths],
    );
  }
}

describe('DayRegisterScreen and the approved-day mirror (#127)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const show = () =>
    render(
      <DayRegisterScreen openDb={() => Promise.resolve(db)} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={0} />,
    );

  it('opens an approved day read-only before any edit, with the server status and a correction offered', async () => {
    await seed(db, [
      { worker: W1, status: 'present', overtimeHundredths: 0 },
      { worker: W2, status: 'half_day', overtimeHundredths: 150 },
    ]);
    await show();

    expect(await screen.findByText(/A manager approved this day\. It is read-only here\./)).toBeTruthy();
    expect(screen.getByText('Approved · Present')).toBeTruthy();
    expect(screen.getByText('Approved · Half day · 1.5 h overtime')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Propose correction for Worker 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Propose correction for Worker 2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Mark everyone present/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change Worker 1' })).toBeNull();
    expect(screen.queryByText('Not marked')).toBeNull();
  });

  it('puts the server values in the correction form, and saves it to the outbox', async () => {
    await seed(db, [{ worker: W2, status: 'half_day', overtimeHundredths: 150 }]);
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: 'Propose correction for Worker 2' }));
    expect(screen.getByLabelText('Overtime hours').props.value).toBe('1.5');
    await fireEvent.changeText(screen.getByLabelText('Reason for the correction'), 'worked the full day');
    await fireEvent.press(screen.getByRole('button', { name: 'Present' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Propose correction' }));

    const rows = await db.all<{ entity: string; payload: string }>('select entity, payload from outbox');
    expect(rows.map((r) => r.entity)).toEqual(['attendance_corrections']);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ worker_id: W2, new_status: 'present', reason: 'worked the full day' });
  });

  it('leaves an open day editable: mark everyone present and Change are there, and no approved line', async () => {
    await seed(db, []);
    await show();

    expect(await screen.findByRole('button', { name: 'Mark everyone present (2)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change Worker 1' })).toBeTruthy();
    expect(screen.queryByText(/^Approved ·/)).toBeNull();
    expect(screen.queryByText(/A manager approved this day/)).toBeNull();
  });
});

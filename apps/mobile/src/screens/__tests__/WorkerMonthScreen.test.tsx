import { Stack } from 'expo-router';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { WorkerMonthScreen } from '../WorkerMonthScreen';

// The header title is set through expo-router, which Jest does not load.
jest.mock('expo-router', () => ({ Stack: { Screen: jest.fn(() => null) } }));

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `cccccccc-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

// Issue #234, ADR-053: pick a worker, see the month, mark a day.

const USER_A = '11111111-0000-4000-8000-00000000000a';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const W1 = '77777777-0000-4000-8000-000000000001';
const W2 = '77777777-0000-4000-8000-000000000002';
const NOW = new Date('2026-11-19T08:00:00.000Z'); // 19 Nov in India

async function seed(db: DeviceDb) {
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
}

let n = 0;
const seedEntry = (db: DeviceDb, date: string, status: string, dayStatus = 'open', hundredths = 0, worker = W1) =>
  db.run(
    `insert into mirror_month_entries (entry_id, site_id, worker_id, work_date, status, overtime_hundredths, day_status)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [`eeeeeeee-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`, SITE, worker, date, status, hundredths, dayStatus],
  );

describe('WorkerMonthScreen (#234)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    n = 0;
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await seed(db);
  });

  const open = async (worker = 'Worker 1') => {
    await render(<WorkerMonthScreen openDb={async () => db} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={0} />);
    await fireEvent.press(await screen.findByLabelText(`Open ${worker}`));
  };
  const outboxEntries = () => db.all<{ payload: string }>(`select payload from outbox where entity = 'attendance_entries'`);

  it('lists the site\'s workers and titles the screen', async () => {
    await render(<WorkerMonthScreen openDb={async () => db} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={0} />);
    expect(await screen.findByLabelText('Open Worker 1')).toBeTruthy();
    expect(screen.getByLabelText('Open Worker 2')).toBeTruthy();
    expect(jest.mocked(Stack.Screen).mock.calls.map((c) => (c[0] as { options: { title: string } }).options.title)).toContain(
      'Worker month · Kothrud',
    );
  });

  it('shows the month summary from the mirror, with "not marked" apart from absent', async () => {
    await seedEntry(db, '2026-11-10', 'present', 'open', 250);
    await seedEntry(db, '2026-11-11', 'half_day');
    await seedEntry(db, '2026-11-12', 'absent');
    await open();

    expect(await screen.findByText('Present 1 · Half days 1 · Leave 0 · Absent 1 · Not marked 27')).toBeTruthy();
    expect(screen.getByText('Payable days 1.5 · Overtime 2.5 h')).toBeTruthy();
    expect(screen.getByText('10 Nov · Present · 2.5 h overtime')).toBeTruthy();
  });

  it('marks a day present in one tap, and the summary follows', async () => {
    await open();
    await fireEvent.press(await screen.findByLabelText('Present 18 Nov'));

    await screen.findByText('Present 1 · Half days 0 · Leave 0 · Absent 0 · Not marked 29');
    const saved = await outboxEntries();
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0]!.payload)).toMatchObject({ worker_id: W1, attendance_date: '2026-11-18', status: 'present' });
  });

  it('changes a marked day to half day with overtime, from the editor', async () => {
    await seedEntry(db, '2026-11-17', 'absent');
    await open();
    await fireEvent.press(await screen.findByLabelText('Change 17 Nov'));
    await fireEvent.press(screen.getByLabelText('Half day'));
    await fireEvent.changeText(screen.getByLabelText('Overtime hours'), '1.5');
    await fireEvent.press(screen.getByLabelText('Save'));

    await screen.findByText('17 Nov · Half day · 1.5 h overtime');
    expect(JSON.parse((await outboxEntries())[0]!.payload)).toMatchObject({ status: 'half_day', overtime_hours: 1.5 });
  });

  it('says why a bad overtime was refused and saves nothing', async () => {
    await open();
    await fireEvent.press(await screen.findByLabelText('More 18 Nov'));
    await fireEvent.changeText(screen.getByLabelText('Overtime hours'), '12');
    await fireEvent.press(screen.getByLabelText('Save'));

    expect(await screen.findByText('Overtime is a number of hours from 0 to 8, with up to 2 decimals.')).toBeTruthy();
    expect(await outboxEntries()).toHaveLength(0);
  });

  it('gives no buttons on an approved day, a future day or a day before the worker joined', async () => {
    await seedEntry(db, '2026-11-12', 'present', 'approved', 0, W2);
    await db.run(`update mirror_roster set assigned_on = '2026-11-08' where worker_id = ?`, [W1]);
    await open();
    await screen.findByLabelText('Present 18 Nov');

    expect(screen.queryByLabelText('Present 12 Nov')).toBeNull();
    expect(screen.getByText('12 Nov · Approved · change it from the day register')).toBeTruthy();
    expect(screen.queryByLabelText('Present 21 Nov')).toBeNull();
    expect(screen.getByText('21 Nov · Not yet')).toBeTruthy();
    expect(screen.queryByLabelText('Present 3 Nov')).toBeNull();
    expect(screen.getByText('3 Nov · Not on this site')).toBeTruthy();
  });

  it('moves between this month and last, and stops there', async () => {
    await seedEntry(db, '2026-10-30', 'leave');
    await open();
    await screen.findByLabelText('Earlier month');
    expect(screen.getByLabelText('Later month').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByLabelText('Earlier month'));
    expect(await screen.findByText('October 2026')).toBeTruthy();
    expect(await screen.findByText('30 Oct · Leave')).toBeTruthy();
    expect(screen.getByLabelText('Earlier month').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByLabelText('Later month'));
    await waitFor(() => expect(screen.getByText('November 2026')).toBeTruthy());
  });

  it('goes back to the worker list', async () => {
    await open();
    await fireEvent.press(await screen.findByLabelText('Back to workers'));
    expect(await screen.findByLabelText('Open Worker 2')).toBeTruthy();
  });
});

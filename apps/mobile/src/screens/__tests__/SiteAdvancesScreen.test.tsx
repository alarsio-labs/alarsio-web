import { Stack } from 'expo-router';
import { configure, fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { runPull, type MirrorSource } from '../../sync/pull';
import { SiteAdvancesScreen } from '../SiteAdvancesScreen';

// The header title is set through expo-router, which Jest does not load.
jest.mock('expo-router', () => ({ Stack: { Screen: jest.fn(() => null) } }));

const headerTitles = () => jest.mocked(Stack.Screen).mock.calls.map((c) => (c[0] as { options: { title: string } }).options.title);

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `dddddddd-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

// See SiteAttendanceScreen.test.tsx: a cold CI runner is slower than the defaults.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const RAM = '77000000-0000-4000-8000-000000000001';
const SITA = '77000000-0000-4000-8000-000000000002';
const PULLED = new Date('2026-10-20T03:00:00.000Z');
const NOW = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST

const rostered = (n: number, workerId: string, name: string) => ({
  assignment_id: `a5000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  worker_id: workerId,
  site_id: SITE,
  worker_code: `W-${n}`,
  name,
  trade: 'mason',
  assigned_at: '2026-10-01T04:00:00+00:00',
  unassigned_at: null,
});

const source = (roster = [rostered(1, RAM, 'Ram'), rostered(2, SITA, 'Sita')]): MirrorSource => ({
  currentUserId: async () => USER_A,
  fetchPage: async (kind, _u, after) => {
    if (after !== null) return [];
    if (kind === 'sites') {
      return [{ id: SITE, org_id: ORG, name: 'Kothrud', address: 'Pune', status: 'active', latitude: 18.5, longitude: 73.8, geofence_radius_m: 200 }];
    }
    return kind === 'roster' ? roster : [];
  },
});

const outboxRows = (db: DeviceDb) =>
  db.all<{ record_id: string; status: string; payload: string }>(
    `select record_id, status, payload from outbox where entity = 'worker_advances' order by seq`,
  );

describe('SiteAdvancesScreen (#239)', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await runPull(db, source(), { now: () => PULLED });
  });

  const show = async (userId = USER_A, pollMs = 50) =>
    await render(<SiteAdvancesScreen openDb={() => Promise.resolve(db)} userId={userId} siteId={SITE} now={() => NOW} pollMs={pollMs} />);
  const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
  const record = async (worker: string, amount: string, note?: string) => {
    await press('Record an advance');
    await press(worker);
    await fireEvent.changeText(await screen.findByLabelText('Amount (₹)'), amount);
    if (note !== undefined) await fireEvent.changeText(screen.getByLabelText('Note (optional)'), note);
  };

  it('opens on the site, titled for it, and says the list is what this phone saved', async () => {
    await show();

    expect(await screen.findByText('Kothrud')).toBeTruthy();
    expect(headerTitles()).toContain('Advances · Kothrud');
    expect(screen.getByText('This list shows the advances you saved on this phone.')).toBeTruthy();
    expect(screen.getByText('No advances saved on this phone yet.')).toBeTruthy();
  });

  it('records an advance with no signal: saved to the outbox, waiting to send, never "on the server"', async () => {
    await show();
    await record('Ram · W-1', '500.50', 'for rent');
    await press('Save');

    expect(await screen.findByText('₹500.50 · Ram · 2026-10-20')).toBeTruthy();
    expect(screen.getByText('Note: for rent')).toBeTruthy();
    expect(screen.getByText('Saved on this phone, waiting to send')).toBeTruthy();
    expect(screen.queryByText(/On the server/)).toBeNull();

    const rows = await outboxRows(db);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toEqual({
      site_id: SITE,
      worker_id: RAM,
      paid_on: '2026-10-20',
      amount_paise: 50050,
      note: 'for rent',
      reverses_id: null,
    });
  });

  it('asks for a worker, then for a good amount, and writes nothing while it refuses', async () => {
    await show();
    await press('Record an advance');
    await fireEvent.changeText(await screen.findByLabelText('Amount (₹)'), '100');
    await press('Save');
    expect(await screen.findByText('Choose a worker.')).toBeTruthy();

    await press('Sita · W-2');
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '1.234');
    await press('Save');
    expect(await screen.findByText('Enter the amount in rupees, with up to two decimals.')).toBeTruthy();
    expect(await outboxRows(db)).toEqual([]);
  });

  it('saves the day chosen in the picker, which stops at today', async () => {
    const openDatePicker = jest.fn((o: { value: Date; maximumDate: Date; onPick: (d: Date) => void }) => o.onPick(new Date(2026, 9, 18, 9)));
    await render(
      <SiteAdvancesScreen openDb={() => Promise.resolve(db)} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={50} openDatePicker={openDatePicker} />,
    );
    await record('Ram · W-1', '300');
    await press(/^Date:/);
    expect(openDatePicker.mock.calls[0]![0].maximumDate.getDate()).toBe(20);

    await press('Save');
    await screen.findByText('₹300 · Ram · 2026-10-18');
    expect(JSON.parse((await outboxRows(db))[0]!.payload)).toMatchObject({ paid_on: '2026-10-18' });
  });

  it('shows what the server answered, in plain words', async () => {
    await show();
    await record('Ram · W-1', '500');
    await press('Save');
    await screen.findByText('Saved on this phone, waiting to send');

    await db.run(`update outbox set status = 'rejected', reason = 'permission_denied'`);
    expect(await screen.findByText("Needs attention · You can't record on this site any more.")).toBeTruthy();

    await db.run(`update outbox set status = 'synced', reason = null`);
    expect(await screen.findByText('On the server')).toBeTruthy();
  });

  it('cancels a synced advance only after a second tap, and then queues the cancellation', async () => {
    await show();
    await record('Ram · W-1', '500');
    await press('Save');
    await screen.findByText('₹500 · Ram · 2026-10-20');
    expect(screen.queryByRole('button', { name: 'Cancel this advance' })).toBeNull(); // not on the server yet

    await db.run(`update outbox set status = 'synced'`);
    await press('Cancel this advance');
    expect(await screen.findByText('Cancel the advance of ₹500? This cannot be undone.')).toBeTruthy();
    await press('Keep it');
    expect(await outboxRows(db)).toHaveLength(1);

    await press('Cancel this advance');
    await press('Yes, cancel it');
    expect(await screen.findByText('Cancels an advance of ₹500')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    const rows = await outboxRows(db);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[1]!.payload)).toMatchObject({ amount_paise: 50000, reverses_id: rows[0]!.record_id });
  });

  it('says so when the roster is empty, and offers no form', async () => {
    const empty = await openTestDeviceDb();
    await prepareDeviceDb(empty, deviceMigrations);
    await runPull(empty, source([]), { now: () => PULLED });
    await render(<SiteAdvancesScreen openDb={() => Promise.resolve(empty)} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={0} />);

    expect(await screen.findByText('No workers on this site yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record an advance' })).toBeNull();
  });

  it("shows another user nothing of this phone's site or advances", async () => {
    await show();
    await record('Ram · W-1', '500');
    await press('Save');
    await screen.findByText('₹500 · Ram · 2026-10-20');

    await screen.unmount();
    await show(USER_B);
    expect(await screen.findByText('This site is not on this phone.')).toBeTruthy();
    expect(screen.queryByText(/₹500/)).toBeNull();
  });

  it('offers Try again when the phone cannot be read', async () => {
    await render(<SiteAdvancesScreen openDb={() => Promise.reject(new Error('disk full'))} userId={USER_A} siteId={SITE} pollMs={0} />);
    expect(await screen.findByText('Could not read the advances on this phone.')).toBeTruthy();
    expect(screen.queryByText(/disk full/)).toBeNull();
  });
});

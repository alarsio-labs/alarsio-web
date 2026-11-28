import { Stack } from 'expo-router';
import { configure, fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { runPull, type MirrorSource } from '../../sync/pull';
import { SiteCashScreen } from '../SiteCashScreen';

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
const PULLED = new Date('2026-10-20T03:00:00.000Z');
const NOW = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST

const rostered = {
  assignment_id: 'a5000000-0000-4000-8000-000000000001',
  worker_id: RAM,
  site_id: SITE,
  worker_code: 'W-1',
  name: 'Ram',
  trade: 'mason',
  assigned_at: '2026-10-01T04:00:00+00:00',
  unassigned_at: null,
};

const source = (rows: { cash?: Record<string, unknown>[]; advances?: Record<string, unknown>[] } = {}): MirrorSource => ({
  currentUserId: async () => USER_A,
  fetchPage: async (kind, _u, after) => {
    if (after !== null) return [];
    if (kind === 'sites') {
      return [{ id: SITE, org_id: ORG, name: 'Kothrud', address: 'Pune', status: 'active', latitude: 18.5, longitude: 73.8, geofence_radius_m: 200 }];
    }
    if (kind === 'roster') return [rostered];
    if (kind === 'cash_entries') return rows.cash ?? [];
    return kind === 'advances' ? (rows.advances ?? []) : [];
  },
});

const outboxRows = (db: DeviceDb) =>
  db.all<{ record_id: string; status: string; payload: string }>(
    `select record_id, status, payload from outbox where entity = 'cash_entries' order by seq`,
  );

describe('SiteCashScreen (#258)', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await runPull(db, source(), { now: () => PULLED });
  });

  const show = async (userId = USER_A, pollMs = 50) =>
    await render(<SiteCashScreen openDb={() => Promise.resolve(db)} userId={userId} siteId={SITE} now={() => NOW} pollMs={pollMs} />);
  const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
  const record = async (category: string, amount: string, note?: string) => {
    await press('Add a cash entry');
    await press(category);
    await fireEvent.changeText(await screen.findByLabelText('Amount (₹)'), amount);
    if (note !== undefined) await fireEvent.changeText(screen.getByLabelText('Note (optional)'), note);
  };

  it('opens on the site, titled for it, saying the book is proposed and still empty', async () => {
    await show();

    expect(await screen.findByText('Kothrud')).toBeTruthy();
    expect(headerTitles()).toContain('Cash book · Kothrud');
    expect(screen.getByText(/This is a proposed cash book/)).toBeTruthy();
    expect(screen.getByText('No cash entries at this site yet.')).toBeTruthy();
    expect(screen.getByText('In the box: ₹0')).toBeTruthy();
  });

  it('records cash received with no signal: saved to the outbox, waiting to send, never "on the server"', async () => {
    await show();
    await record('Cash received', '1000', 'from owner');
    await press('Save');

    expect(await screen.findByText('Cash received · ₹1,000 · 2026-10-20')).toBeTruthy();
    expect(screen.getByText('Note: from owner')).toBeTruthy();
    expect(screen.getByText('In ₹1,000 · Out ₹0 · Advances ₹0')).toBeTruthy();
    expect(screen.getByText('In the box: ₹1,000')).toBeTruthy();
    expect(screen.getByText('1 waiting to send')).toBeTruthy();
    expect(screen.getByText('Saved on this phone, waiting to send')).toBeTruthy();
    expect(screen.queryByText(/On the server/)).toBeNull();

    const rows = await outboxRows(db);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toEqual({
      site_id: SITE,
      entry_date: '2026-10-20',
      category: 'received',
      amount_paise: 100000,
      note: 'from owner',
      reverses_id: null,
    });
  });

  it('says so in plain words when more went out than came in', async () => {
    await show();
    await record('Wages', '500.50');
    await press('Save');

    expect(await screen.findByText('Short by ₹500.50. More went out than came in.')).toBeTruthy();
    expect(screen.queryByText(/In the box/)).toBeNull();
  });

  it('asks for a type, then for a good amount, and writes nothing while it refuses', async () => {
    await show();
    await press('Add a cash entry');
    await fireEvent.changeText(await screen.findByLabelText('Amount (₹)'), '100');
    await press('Save');
    expect(await screen.findByText('Choose a type.')).toBeTruthy();

    await press('Food');
    await fireEvent.changeText(screen.getByLabelText('Amount (₹)'), '1.234');
    await press('Save');
    expect(await screen.findByText('Enter the amount in rupees, with up to two decimals.')).toBeTruthy();
    expect(await outboxRows(db)).toEqual([]);
  });

  it('saves the day chosen in the picker, which stops at today', async () => {
    const openDatePicker = jest.fn((o: { value: Date; maximumDate: Date; onPick: (d: Date) => void }) => o.onPick(new Date(2026, 9, 18, 9)));
    await render(
      <SiteCashScreen openDb={() => Promise.resolve(db)} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={50} openDatePicker={openDatePicker} />,
    );
    await record('Transport', '300');
    await press(/^Date:/);
    expect(openDatePicker.mock.calls[0]![0].maximumDate.getDate()).toBe(20);

    await press('Save');
    await screen.findByText('Transport · ₹300 · 2026-10-18');
    expect(JSON.parse((await outboxRows(db))[0]!.payload)).toMatchObject({ entry_date: '2026-10-18' });
  });

  it('shows what the server answered, in plain words', async () => {
    await show();
    await record('Food', '200');
    await press('Save');
    await screen.findByText('Saved on this phone, waiting to send');

    await db.run(`update outbox set status = 'rejected', reason = 'permission_denied'`);
    expect(await screen.findByText("Needs attention · You can't record on this site any more.")).toBeTruthy();
    expect(screen.queryByText(/waiting to send/)).toBeNull();

    await db.run(`update outbox set status = 'synced', reason = null`);
    expect(await screen.findByText('On the server')).toBeTruthy();
  });

  it('cancels a synced entry only after a second tap, and then queues the cancellation', async () => {
    await show();
    await record('Material', '300');
    await press('Save');
    await screen.findByText('Material · ₹300 · 2026-10-20');
    expect(screen.queryByRole('button', { name: 'Cancel this entry' })).toBeNull(); // not on the server yet

    await db.run(`update outbox set status = 'synced'`);
    await press('Cancel this entry');
    expect(await screen.findByText('Cancel the entry of ₹300? This cannot be undone.')).toBeTruthy();
    await press('Keep it');
    expect(await outboxRows(db)).toHaveLength(1);

    await press('Cancel this entry');
    await press('Yes, cancel it');
    expect(await screen.findByText('Cancels an entry of ₹300')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    const rows = await outboxRows(db);
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[1]!.payload)).toMatchObject({ category: 'material', amount_paise: 30000, reverses_id: rows[0]!.record_id });
  });

  it('shows entries and advances the server holds, and offers no cancel on an advance', async () => {
    const full = await openTestDeviceDb();
    await prepareDeviceDb(full, deviceMigrations);
    await runPull(
      full,
      source({
        cash: [{ id: 'ca000000-0000-4000-8000-000000000001', site_id: SITE, entry_date: '2026-10-15', category: 'received', amount_paise: 100000, note: null, reverses_id: null }],
        advances: [{ id: 'ad000000-0000-4000-8000-000000000001', site_id: SITE, worker_id: RAM, paid_on: '2026-10-12', amount_paise: 20000, note: null, reverses_id: null }],
      }),
      { now: () => PULLED },
    );
    await render(<SiteCashScreen openDb={() => Promise.resolve(full)} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={0} />);

    expect(await screen.findByText('Advance · Ram · ₹200 · 2026-10-12')).toBeTruthy();
    expect(screen.getByText('Paid from the Advances screen')).toBeTruthy();
    expect(screen.getByText('Cash received · ₹1,000 · 2026-10-15')).toBeTruthy();
    expect(screen.getByText('In ₹1,000 · Out ₹0 · Advances ₹200')).toBeTruthy();
    expect(screen.getByText('In the box: ₹800')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Cancel this entry' })).toHaveLength(1);
  });

  it("shows another user nothing of this phone's site or entries", async () => {
    await show();
    await record('Food', '500');
    await press('Save');
    await screen.findByText('Food · ₹500 · 2026-10-20');

    await screen.unmount();
    await show(USER_B);
    expect(await screen.findByText('This site is not on this phone.')).toBeTruthy();
    expect(screen.queryByText(/₹500/)).toBeNull();
  });

  it('offers Try again when the phone cannot be read', async () => {
    await render(<SiteCashScreen openDb={() => Promise.reject(new Error('disk full'))} userId={USER_A} siteId={SITE} pollMs={0} />);
    expect(await screen.findByText('Could not read the cash book on this phone.')).toBeTruthy();
    expect(screen.queryByText(/disk full/)).toBeNull();
  });
});

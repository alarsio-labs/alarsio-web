import { configure, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { markAllPresent } from '../../attendance/register-store';
import { saveCheckIn } from '../../attendance/visit-store';
import type { PublicConfigResult } from '../../config/public-config';
import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { saveReport } from '../../reports/report-store';
import { HomeScreen } from '../HomeScreen';

// A cold runner needs more than the default waits for sql.js to start; these are limits on waiting.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `bbbbbbbb-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const config: PublicConfigResult = {
  ok: true,
  config: { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_abc' },
};
const USER = '11111111-0000-4000-8000-00000000000a';
const OTHER = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = '51000000-0000-4000-8000-000000000001';
const SITE_2 = '51000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST, Tue 20 Oct
const TODAY = '2026-10-20';
const worker = (n: number) => `77000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EMPTY = { headcount: '', workDone: '', blockers: '', seriousBlocker: false, safetyIncident: false, nextDayPlan: '' };
const FULL = { ...EMPTY, headcount: '12', workDone: 'Slab' };

describe('HomeScreen as Today (A8)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [USER, NOW.toISOString()]);
    await db.run(
      `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
       values (?, ?, 'Kothrud', 'Pune', 18.52, 73.85, 200, 'active'), (?, ?, 'Baner', 'Pune', 18.56, 73.78, 150, 'active')`,
      [SITE_1, ORG, SITE_2, ORG],
    );
    for (let n = 1; n <= 3; n += 1) {
      await db.run(
        `insert into mirror_roster (assignment_id, worker_id, site_id, code, name, trade, assigned_on, unassigned_on)
         values (?, ?, ?, ?, ?, 'mason', '2026-10-01', null)`,
        [`aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`, worker(n), SITE_1, `W${n}`, `Worker ${n}`],
      );
    }
  });

  const show = (props: Partial<ComponentProps<typeof HomeScreen>> = {}) =>
    render(<HomeScreen openDb={() => Promise.resolve(db)} userId={USER} config={config} now={() => NOW} pollMs={0} {...props} />);

  it('shows a card for each site with its three rows, read from the phone', async () => {
    await show();
    expect(await screen.findByRole('button', { name: 'Kothrud. Check in: Not checked in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kothrud. Register: Register 0 / 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kothrud. Report: Not started' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Baner. Check in: Not checked in' })).toBeTruthy();
    expect(screen.getByText('20 Oct')).toBeTruthy();
  });

  it('says checked in for a check-in today, and not for one from yesterday', async () => {
    const visit = (at: string) => ({
      orgId: ORG,
      siteId: SITE_2,
      checkIn: { at, lat: 18.56, lng: 73.78, reason: null },
      checkOut: null,
    });
    await saveCheckIn(db, USER, visit('2026-10-19T04:00:00.000Z'), NOW);
    await saveCheckIn(db, USER, { ...visit('2026-10-20T03:30:00.000Z'), siteId: SITE_1 }, NOW);
    await show();

    expect(await screen.findByRole('button', { name: 'Kothrud. Check in: Checked in ✓' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Baner. Check in: Not checked in' })).toBeTruthy();
  });

  it("counts today's marks against the roster", async () => {
    await markAllPresent(db, USER, { id: SITE_1, orgId: ORG }, TODAY, NOW);
    await show();
    expect(await screen.findByRole('button', { name: 'Kothrud. Register: Register 3 / 3' })).toBeTruthy();
  });

  it('never says submitted before the server accepts the report', async () => {
    await saveReport(db, USER, { id: SITE_1, orgId: ORG }, TODAY, FULL, 'submitted', {}, NOW);
    await show();
    expect(await screen.findByRole('button', { name: 'Kothrud. Report: Saved on this phone, waiting to send' })).toBeTruthy();
    expect(screen.queryByText('Submitted')).toBeNull();
  });

  it('says Submitted once the server has accepted it', async () => {
    await saveReport(db, USER, { id: SITE_1, orgId: ORG }, TODAY, FULL, 'submitted', {}, NOW);
    await db.run(`update outbox set status = 'synced' where entity = 'daily_reports'`);
    await show();
    expect(await screen.findByText('Submitted')).toBeTruthy();
  });

  it('shows a draft on the phone as a draft', async () => {
    await saveReport(db, USER, { id: SITE_1, orgId: ORG }, TODAY, EMPTY, 'draft', {}, NOW);
    await show();
    expect(await screen.findByText('Draft, saved on this phone')).toBeTruthy();
  });

  it('shows a refused report as needing attention', async () => {
    await saveReport(db, USER, { id: SITE_1, orgId: ORG }, TODAY, EMPTY, 'draft', {}, NOW);
    await db.run(`update outbox set status = 'rejected', reason = 'permission_denied' where entity = 'daily_reports'`);
    await show();
    expect(await screen.findByText(/^Needs attention/)).toBeTruthy();
  });

  it('opens the right screen from each row', async () => {
    const onOpenCheckIn = jest.fn();
    const onOpenRegister = jest.fn();
    const onOpenReport = jest.fn();
    await show({ onOpenCheckIn, onOpenRegister, onOpenReport });

    await fireEvent.press(await screen.findByRole('button', { name: /^Kothrud\. Check in/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Kothrud\. Register/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^Baner\. Report/ }));
    expect(onOpenCheckIn).toHaveBeenCalledWith(SITE_1);
    expect(onOpenRegister).toHaveBeenCalledWith(SITE_1);
    expect(onOpenReport).toHaveBeenCalledWith(SITE_2);
  });

  it('links to unfinished reports from earlier days', async () => {
    const onOpenReports = jest.fn();
    await saveReport(db, USER, { id: SITE_1, orgId: ORG }, '2026-10-18', EMPTY, 'draft', {}, NOW);
    await show({ onOpenReports });

    await fireEvent.press(await screen.findByRole('link', { name: 'Not finished reports: 1' }));
    expect(onOpenReports).toHaveBeenCalledTimes(1);
  });

  it('opens Materials', async () => {
    const onOpenMaterials = jest.fn();
    await show({ onOpenMaterials });
    await fireEvent.press(await screen.findByRole('button', { name: 'Materials' }));
    expect(onOpenMaterials).toHaveBeenCalledTimes(1);
  });

  it('says what to do when there are no sites', async () => {
    await db.run('delete from mirror_sites');
    await show();
    expect(await screen.findByText('No sites yet. Pull to refresh, or ask your manager to add you to a site.')).toBeTruthy();
  });

  it("shows nothing of another user's records", async () => {
    await markAllPresent(db, USER, { id: SITE_1, orgId: ORG }, TODAY, NOW);
    await show({ userId: OTHER });
    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.queryByText(/Register 3/)).toBeNull();
  });

  it('shows no cards when no user is signed in', async () => {
    await show({ userId: undefined, onOpenMaterials: jest.fn() });
    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Check in/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Materials' })).toBeNull();
  });
});

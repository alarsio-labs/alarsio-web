import { configure, fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { saveReport } from '../../reports/report-store';
import { applyVerdicts, claimBatch } from '../../sync/outbox';
import { ReportSitesScreen } from '../ReportSitesScreen';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `ffffffff-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const KOTHRUD = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG };
const BANER = { id: '51000000-0000-4000-8000-000000000002', orgId: ORG };
const NOW = new Date('2026-10-20T12:30:00.000Z'); // 18:00 IST
const TODAY = '2026-10-20';
const FULL = { headcount: '12', workDone: 'Slab', blockers: '', seriousBlocker: false, safetyIncident: false, nextDayPlan: '' };

async function seedSites(db: DeviceDb, user: string) {
  for (const [site, name] of [
    [KOTHRUD, 'Kothrud'],
    [BANER, 'Baner'],
  ] as const) {
    await db.run(
      `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
       values (?, ?, ?, 'Pune', 18.5, 73.8, 200, 'active')`,
      [site.id, site.orgId, name],
    );
  }
  await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [user, NOW.toISOString()]);
}

describe('ReportSitesScreen (#81)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const show = async (userId = USER_A, onOpenReport = jest.fn()) => {
    await render(
      <ReportSitesScreen openDb={() => Promise.resolve(db)} userId={userId} onOpenReport={onOpenReport} now={() => NOW} pollMs={50} />,
    );
    return onOpenReport;
  };

  it("shows each site with where today's report stands", async () => {
    await seedSites(db, USER_A);
    await saveReport(db, USER_A, KOTHRUD, TODAY, FULL, 'draft', {}, NOW);
    await show();

    await screen.findByRole('button', { name: 'Kothrud, Draft, saved on this phone' });
    expect(screen.getByRole('button', { name: 'Baner, Not started' })).toBeTruthy();
  });

  it('says "Submitted" for a site only once the server accepted the report', async () => {
    await seedSites(db, USER_A);
    const recordId = await saveReport(db, USER_A, KOTHRUD, TODAY, FULL, 'submitted', {}, NOW);
    await show();
    await screen.findByRole('button', { name: 'Kothrud, Saved on this phone, waiting to send' });

    await claimBatch(db, USER_A, NOW);
    await applyVerdicts(db, [{ entity: 'daily_reports', record_id: recordId, verdict: 'accepted', reason: null }], NOW);
    await screen.findByRole('button', { name: 'Kothrud, Submitted' });
  });

  it("opens today's report for a site", async () => {
    await seedSites(db, USER_A);
    const open = await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'Baner, Not started' }));

    expect(open).toHaveBeenCalledWith(BANER.id, TODAY);
  });

  it('lists an earlier draft under "Not finished", and opens it on its own day', async () => {
    await seedSites(db, USER_A);
    await saveReport(db, USER_A, BANER, '2026-10-18', FULL, 'draft', {}, NOW);
    const open = await show();

    await screen.findByText('Not finished');
    await fireEvent.press(screen.getByRole('button', { name: 'Baner, 18 Oct, Draft, saved on this phone' }));
    expect(open).toHaveBeenCalledWith(BANER.id, '2026-10-18');
  });

  it("shows user B neither user A's sites nor A's reports", async () => {
    await seedSites(db, USER_A);
    await saveReport(db, USER_A, BANER, '2026-10-18', FULL, 'draft', {}, NOW);
    await show(USER_B);

    await screen.findByText(/No sites on this phone yet/);
    expect(screen.queryByText('Not finished')).toBeNull();
  });
});

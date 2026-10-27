import { configure, fireEvent, render, screen } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { MaterialsSitesScreen } from '../MaterialsSitesScreen';

// See SiteAttendanceScreen.test.tsx: a cold CI runner is slower than the defaults.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = '51000000-0000-4000-8000-000000000001';
const SITE_2 = '51000000-0000-4000-8000-000000000002';

async function seed(db: DeviceDb, user: string) {
  await db.run(
    `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
     values (?, ?, 'Kothrud', 'Pune, Kothrud', 18.52, 73.85, 200, 'active'),
            (?, ?, 'Baner', 'Pune, Baner', 18.56, 73.78, 150, 'paused')`,
    [SITE_1, ORG, SITE_2, ORG],
  );
  await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, '2026-10-20T08:00:00.000Z')`, [user]);
}

describe('MaterialsSitesScreen (#82)', () => {
  let db: DeviceDb;
  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });
  const show = (userId: string, onOpenSite = jest.fn()) =>
    render(<MaterialsSitesScreen openDb={() => Promise.resolve(db)} userId={userId} onOpenSite={onOpenSite} />);

  it("lists this user's sites and opens the one tapped", async () => {
    await seed(db, USER_A);
    const onOpenSite = jest.fn();
    await show(USER_A, onOpenSite);

    expect(await screen.findByText('Kothrud')).toBeTruthy();
    expect(screen.getByText('Pune, Kothrud')).toBeTruthy();
    expect(screen.getByText('Baner')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /Kothrud/ }));
    expect(onOpenSite).toHaveBeenCalledWith(SITE_1);
  });

  it("shows nothing of another user's mirror", async () => {
    await seed(db, USER_A);
    await show(USER_B);

    expect(await screen.findByText(/No sites on this phone yet/)).toBeTruthy();
    expect(screen.queryByText('Kothrud')).toBeNull();
  });

  it('says so instead of an empty list when the device database fails', async () => {
    await render(<MaterialsSitesScreen openDb={() => Promise.reject(new Error('disk full'))} userId={USER_A} onOpenSite={jest.fn()} />);
    expect(await screen.findByText('Could not read the sites on this phone.')).toBeTruthy();
    expect(screen.queryByText(/disk full/)).toBeNull(); // no raw error text (ADR-029)
  });
});

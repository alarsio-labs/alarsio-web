import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { mirrorInfo, runPull, type MirrorSource } from '../../sync/pull';
import { signOutAndClearMirrors } from '../sign-out';

const USER = '11111111-0000-4000-8000-00000000000a';
const SITE = {
  id: '51000000-0000-4000-8000-000000000001',
  org_id: '0a0a0a0a-0000-4000-8000-0000000000a1',
  name: 'Kothrud',
  address: 'Pune',
  status: 'active',
  latitude: 18.5,
  longitude: 73.8,
  geofence_radius_m: 200,
};

async function dbWithMirror(): Promise<DeviceDb> {
  const db = await openTestDeviceDb();
  await prepareDeviceDb(db, deviceMigrations);
  const source: MirrorSource = {
    currentUserId: async () => USER,
    fetchPage: async (kind, _user, after) => (kind === 'sites' && after === null ? [SITE] : []),
  };
  await runPull(db, source);
  expect(await mirrorInfo(db)).not.toBeNull();
  return db;
}

describe('signOutAndClearMirrors (#49)', () => {
  it("signs out, then removes the user's copy from the phone", async () => {
    const db = await dbWithMirror();
    const order: string[] = [];
    const signOut = jest.fn(async () => {
      order.push('signOut');
      expect(await mirrorInfo(db)).not.toBeNull(); // still there until sign-out has worked
    });

    await signOutAndClearMirrors(signOut, async () => db);

    expect(order).toEqual(['signOut']);
    expect(await mirrorInfo(db)).toBeNull();
    expect(await db.all('select * from mirror_sites')).toEqual([]);
  });

  it('keeps the copy and passes the error on when sign-out fails, since the user is still signed in', async () => {
    const db = await dbWithMirror();

    await expect(
      signOutAndClearMirrors(async () => {
        throw new Error('sign out failed');
      }, async () => db),
    ).rejects.toThrow('sign out failed');

    expect(await mirrorInfo(db)).not.toBeNull();
  });

  it('does not fail the sign-out when the copy cannot be cleared', async () => {
    const signOut = jest.fn(async () => undefined);

    await expect(
      signOutAndClearMirrors(signOut, () => Promise.reject(new Error('database is locked'))),
    ).resolves.toBeUndefined();

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

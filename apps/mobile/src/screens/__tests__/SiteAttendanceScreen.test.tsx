import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { LocationProvider, PermissionState, PositionResult } from '../../attendance/location';
import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { applyVerdicts, claimBatch } from '../../sync/outbox';
import { SiteAttendanceScreen } from '../SiteAttendanceScreen';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `cccccccc-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST
const LATER = new Date('2026-10-20T12:00:00.000Z'); // 17:30 IST

// The pin and a fix 100 m and 450 m north of it (radius 200 m).
const PIN = { latitude: 18.5204, longitude: 73.8567 };
const R = 6371008.8;
const north = (m: number) => ({ lat: PIN.latitude + ((m / R) * 180) / Math.PI, lng: PIN.longitude });
const fix = (m: number): PositionResult => ({ kind: 'located', ...north(m), accuracyM: 8 });

interface FakeLocation extends LocationProvider {
  calls: { getPermission: number; requestPermission: number; readPosition: number };
}

function fakeLocation(opts: {
  permission?: PermissionState;
  afterRequest?: PermissionState;
  position?: PositionResult;
}): FakeLocation {
  const calls = { getPermission: 0, requestPermission: 0, readPosition: 0 };
  let permission = opts.permission ?? 'granted';
  return {
    calls,
    async getPermission() {
      calls.getPermission += 1;
      return permission;
    },
    async requestPermission() {
      calls.requestPermission += 1;
      permission = opts.afterRequest ?? 'granted';
      return permission;
    },
    async readPosition() {
      calls.readPosition += 1;
      return opts.position ?? fix(100);
    },
  };
}

async function seedSite(db: DeviceDb, user: string, orgId: string | null = ORG, name = 'Kothrud') {
  await db.run(
    `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
     values (?, ?, ?, 'Pune', ?, ?, 200, 'active')`,
    [SITE, orgId, name, PIN.latitude, PIN.longitude],
  );
  await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [user, NOW.toISOString()]);
}

const outboxRows = (db: DeviceDb) =>
  db.all<{ record_id: string; status: string; payload: string }>('select record_id, status, payload from outbox');

describe('SiteAttendanceScreen (#79)', () => {
  let db: DeviceDb;
  let clock: Date;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    clock = NOW;
  });

  const show = async (location: LocationProvider, userId = USER_A, pollMs = 25) =>
    render(
      <SiteAttendanceScreen
        openDb={() => Promise.resolve(db)}
        userId={userId}
        siteId={SITE}
        location={location}
        now={() => clock}
        pollMs={pollMs}
      />,
    );

  // The screen reads the phone's database after it opens, so a button may not be there yet.
  const press = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));

  describe('location is read only on the tap (AC 4)', () => {
    it('makes no location call while the screen opens and sits idle', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({});
      await show(location);
      await screen.findByRole('button', { name: 'Check in' });
      await new Promise((r) => setTimeout(r, 80)); // a few polls

      expect(location.calls).toEqual({ getPermission: 0, requestPermission: 0, readPosition: 0 });
    });

    it('reads the position once per tap', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({});
      await show(location);
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);

      expect(location.calls.readPosition).toBe(1);
    });
  });

  describe('the permission flow (AC 5)', () => {
    it('explains first, and does not ask the phone until the supervisor continues', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({ permission: 'undetermined' });
      await show(location);
      await press('Check in');

      expect(await screen.findByText(/reads your location once, when you tap Check in or Check out/)).toBeTruthy();
      expect(screen.getByText(/does not track you in the background/)).toBeTruthy();
      expect(location.calls.requestPermission).toBe(0);
      expect(location.calls.readPosition).toBe(0);
      expect(await outboxRows(db)).toHaveLength(0);

      await press('Continue');
      await screen.findByText(/Checked in 09:10/);
      expect(location.calls.requestPermission).toBe(1);
      expect(location.calls.readPosition).toBe(1);
    });

    it('"Not now" asks nothing and saves nothing', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({ permission: 'undetermined' });
      await show(location);
      await press('Check in');
      await press('Not now');

      expect(await screen.findByRole('button', { name: 'Check in' })).toBeTruthy();
      expect(location.calls.requestPermission).toBe(0);
      expect(await outboxRows(db)).toHaveLength(0);
    });

    it('with permission already granted there is no explanation and no prompt', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({ permission: 'granted' });
      await show(location);
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);

      expect(screen.queryByText(/reads your location once/)).toBeNull();
      expect(location.calls.requestPermission).toBe(0);
    });
  });

  describe('no location (AC 6)', () => {
    const unavailableCases: [string, Parameters<typeof fakeLocation>[0]][] = [
      ['permission denied at the prompt', { permission: 'undetermined', afterRequest: 'denied' }],
      ['permission already denied', { permission: 'denied' }],
      ['services off', { position: { kind: 'unavailable', cause: 'services_off' } }],
      ['no fix in time', { position: { kind: 'unavailable', cause: 'timeout' } }],
      ['a provider error', { position: { kind: 'unavailable', cause: 'error' } }],
    ];

    it.each(unavailableCases)('%s: asks for a reason and saves nothing until it is given', async (_name, opts) => {
      await seedSite(db, USER_A);
      await show(fakeLocation(opts));
      await press('Check in');
      if (opts.permission === 'undetermined') await press('Continue');

      expect(await screen.findByText(/Location is not available/)).toBeTruthy();
      expect(await outboxRows(db)).toHaveLength(0);

      await press('Check in without location');
      expect(await screen.findByText('Say why, in a few words.')).toBeTruthy();
      expect(await outboxRows(db)).toHaveLength(0);

      await fireEvent.changeText(screen.getByLabelText('Reason'), '   ');
      await press('Check in without location');
      expect(await screen.findByText('Say why, in a few words.')).toBeTruthy();
      expect(await outboxRows(db)).toHaveLength(0);
    });

    it('with a reason saves a flagged visit at 0, 0', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({ permission: 'denied' }));
      await press('Check in');
      await screen.findByText(/Location is not available/);
      await fireEvent.changeText(screen.getByLabelText('Reason'), 'phone GPS is broken');
      await press('Check in without location');

      await screen.findByText(/Checked in 09:10/);
      const [row] = await outboxRows(db);
      expect(JSON.parse(row!.payload)).toMatchObject({
        check_in_lat: 0,
        check_in_lng: 0,
        check_in_reason: 'Location not shared: phone GPS is broken',
      });
    });
  });

  describe('the geofence estimate (AC 2)', () => {
    it('inside: saves at once, with no reason', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({ position: fix(100) }));
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);

      const [row] = await outboxRows(db);
      expect(JSON.parse(row!.payload).check_in_reason).toBeNull();
    });

    it('outside: shows the estimate, needs a reason, and cancelling saves nothing', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({ position: fix(450) }));
      await press('Check in');

      expect(await screen.findByText(/about 450 m from this site \(limit 200 m\)/)).toBeTruthy();
      expect(screen.getByText(/GPS accuracy about 8 m/)).toBeTruthy();
      expect(await outboxRows(db)).toHaveLength(0);

      await press('Check in anyway');
      expect(await screen.findByText('Say why, in a few words.')).toBeTruthy();
      expect(await outboxRows(db)).toHaveLength(0);

      await press('Cancel');
      expect(await screen.findByRole('button', { name: 'Check in' })).toBeTruthy();
      expect(await outboxRows(db)).toHaveLength(0);
    });

    it('outside with a reason: saves with the reason and the real coordinates', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({ position: fix(450) }));
      await press('Check in');
      await screen.findByText(/about 450 m/);
      await fireEvent.changeText(screen.getByLabelText('Reason'), '  at the supplier next door ');
      await press('Check in anyway');

      await screen.findByText(/Checked in 09:10/);
      const [row] = await outboxRows(db);
      const payload = JSON.parse(row!.payload);
      expect(payload.check_in_reason).toBe('at the supplier next door');
      expect(payload.check_in_lat).not.toBe(0);
    });
  });

  describe('never says submitted before the server accepts (AC 1)', () => {
    it('says saved on this phone while pending, and on the server only after accepted', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({}));
      await press('Check in');

      await screen.findByText('Saved on this phone, waiting to send');
      expect(screen.queryByText(/submitted|on the server/i)).toBeNull();

      const [row] = await outboxRows(db);
      await claimBatch(db, USER_A, NOW);
      expect(screen.queryByText(/submitted|on the server/i)).toBeNull(); // syncing is not sent either
      await applyVerdicts(db, [{ entity: 'site_visits', record_id: row!.record_id, verdict: 'accepted', reason: null }], NOW);

      expect(await screen.findByText('On the server')).toBeTruthy();
      expect(screen.queryByText(/waiting to send/)).toBeNull();
    });

    it('a retryable error is still not sent', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({}));
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);
      const [row] = await outboxRows(db);
      await claimBatch(db, USER_A, NOW);
      await applyVerdicts(db, [{ entity: 'site_visits', record_id: row!.record_id, verdict: 'retryable_error', reason: 'busy' }], NOW);

      expect(await screen.findByText('Could not send yet. Will retry.')).toBeTruthy();
      expect(screen.queryByText(/On the server/)).toBeNull();
    });
  });

  describe('a double tap saves one visit, not two', () => {
    const slow = (ms = 30) => new Promise((r) => setTimeout(r, ms));
    // The second press comes before the first handler has finished: fireEvent resolves
    // when its act does, not when the handler's own awaits (the phone's answer, the
    // save) have. Not Promise.all: overlapping act calls break the renderer's act state.
    const tapTwice = async (button: Parameters<typeof fireEvent.press>[0]) => {
      await fireEvent.press(button);
      await fireEvent.press(button);
    };

    it('Check in tapped twice while the phone is still answering', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({});
      const getPermission = location.getPermission;
      location.getPermission = async () => {
        await slow();
        return getPermission();
      };
      await show(location);
      const button = await screen.findByRole('button', { name: 'Check in' });

      await tapTwice(button);
      await screen.findByText(/Checked in 09:10/);

      expect(await outboxRows(db)).toHaveLength(1);
      expect(location.calls.readPosition).toBe(1);
    });

    it('"Check in anyway" tapped twice', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({ position: fix(450) });
      await show(location);
      await press('Check in');
      await screen.findByText(/about 450 m/);
      await fireEvent.changeText(screen.getByLabelText('Reason'), 'at the supplier');
      // A slow save, so the second tap lands while the first is still writing.
      const transaction = db.transaction.bind(db);
      db.transaction = async (fn) => {
        await slow(60);
        return transaction(fn);
      };
      const go = screen.getByRole('button', { name: 'Check in anyway' });

      await tapTwice(go);
      await screen.findByText(/Checked in 09:10/);

      expect(await outboxRows(db)).toHaveLength(1);
    });
  });

  describe('a stored visit that cannot be read', () => {
    it('is skipped, so one bad row cannot crash the screen', async () => {
      await seedSite(db, USER_A);
      await db.run(
        `insert into outbox (entity, record_id, author_id, payload, created_at, updated_at)
         values ('site_visits', ?, ?, ?, '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z')`,
        [
          'bbbbbbbb-0000-4000-8000-000000000001',
          USER_A,
          JSON.stringify({
            org_id: ORG,
            site_id: SITE,
            check_in_at: 'not a time',
            check_in_lat: 18.5,
            check_in_lng: 73.8,
            check_in_reason: null,
            check_out_at: null,
            check_out_lat: null,
            check_out_lng: null,
            check_out_reason: null,
          }),
        ],
      );
      await show(fakeLocation({}));

      expect(await screen.findByRole('button', { name: 'Check in' })).toBeTruthy();
      expect(screen.queryByText(/Checked in/)).toBeNull();
    });
  });

  describe('check out (AC 9, 10)', () => {
    it('hides Check in for an open visit, and check-out re-saves the same record with both legs', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({}));
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);
      expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
      const [before] = await outboxRows(db);

      clock = LATER;
      await press('Check out');
      await screen.findByText(/Checked out 17:30/);

      const rows = await outboxRows(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.record_id).toBe(before!.record_id);
      expect(JSON.parse(rows[0]!.payload)).toMatchObject({
        check_in_at: NOW.toISOString(),
        check_out_at: LATER.toISOString(),
      });
      expect(screen.queryByRole('button', { name: 'Check out' })).toBeNull();
    });

    it('refuses a check-out earlier than the check-in, and saves nothing', async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({}));
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);
      const before = await outboxRows(db);

      clock = new Date(NOW.getTime() - 60_000);
      await press('Check out');

      expect(await screen.findByText(/clock is earlier than the check-in/)).toBeTruthy();
      expect(await outboxRows(db)).toEqual(before);
    });

    it('checking out outside the fence needs a reason too', async () => {
      await seedSite(db, USER_A);
      const location = fakeLocation({});
      await show(location);
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);

      const far = fakeLocation({ position: fix(900) });
      clock = LATER;
      // Same screen, a new fix: swap what the provider reports.
      location.readPosition = far.readPosition;
      await press('Check out');
      expect(await screen.findByText(/about 900 m from this site/)).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText('Reason'), 'left for the bank');
      await press('Check out anyway');
      await screen.findByText(/Checked out 17:30/);

      const [row] = await outboxRows(db);
      expect(JSON.parse(row!.payload).check_out_reason).toBe('left for the bank');
    });
  });

  describe('an earlier open visit (AC 12)', () => {
    it('is shown with its date and can be closed, and does not stop today\'s check-in', async () => {
      await seedSite(db, USER_A);
      clock = new Date(NOW.getTime() - 86_400_000);
      await show(fakeLocation({}));
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);

      // The next day: the phone was never checked out.
      clock = NOW;
      await screen.unmount();
      await show(fakeLocation({}));
      expect(await screen.findByText('19 Oct · Checked in 09:10')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Check out/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Check in' })).toBeTruthy();
    });
  });

  describe('needs attention (AC 13, 14)', () => {
    const checkedIn = async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({}));
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);
      const [row] = await outboxRows(db);
      await claimBatch(db, USER_A, NOW);
      return row!.record_id;
    };

    it('shows a conflict as needs attention, in plain words, with no raw code', async () => {
      const id = await checkedIn();
      await applyVerdicts(db, [{ entity: 'site_visits', record_id: id, verdict: 'conflict', reason: 'checked_out' }], NOW);

      const text = await screen.findByText(/^Needs attention/);
      expect(text.props.children).toMatch(/already/i);
      expect(screen.queryByText(/checked_out/)).toBeNull();
    });

    it('shows a permission refusal as needs attention', async () => {
      const id = await checkedIn();
      await applyVerdicts(db, [{ entity: 'site_visits', record_id: id, verdict: 'rejected', reason: 'permission_denied' }], NOW);

      expect(await screen.findByText(/^Needs attention · You can't record on this site any more/)).toBeTruthy();
    });

    it('lets a rejected visit be fixed with a reason and sent again under the same id', async () => {
      const id = await checkedIn();
      await applyVerdicts(db, [{ entity: 'site_visits', record_id: id, verdict: 'rejected', reason: 'invalid_input' }], NOW);

      await fireEvent.press(await screen.findByRole('button', { name: 'Add a reason and send again' }));
      await fireEvent.changeText(screen.getByLabelText('Reason'), 'I was at the gate');
      await press('Send again');

      await waitFor(async () => expect((await outboxRows(db))[0]).toMatchObject({ record_id: id, status: 'pending' }));
      expect(JSON.parse((await outboxRows(db))[0]!.payload).check_in_reason).toBe('I was at the gate');
      expect(await screen.findByText('Saved on this phone, waiting to send')).toBeTruthy();
    });

    it('offers no resend for a conflict: only saving again re-queues, and the server kept its version', async () => {
      const id = await checkedIn();
      await applyVerdicts(db, [{ entity: 'site_visits', record_id: id, verdict: 'conflict', reason: 'different_visit' }], NOW);
      await screen.findByText(/^Needs attention/);
      expect(screen.queryByRole('button', { name: 'Add a reason and send again' })).toBeNull();
    });
  });

  describe('sites and users (AC 15)', () => {
    it('blocks a site whose org_id has not reached the phone yet', async () => {
      await seedSite(db, USER_A, null);
      const location = fakeLocation({});
      await show(location);

      expect(await screen.findByText(/Connect once to refresh your sites/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
      expect(location.calls.getPermission).toBe(0);
    });

    it("does not show another user's site, or let them check in to it", async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({}), USER_B);

      expect(await screen.findByText(/This site is not on this phone/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
    });

    it("does not show another user's open visit", async () => {
      await seedSite(db, USER_A);
      await show(fakeLocation({}));
      await press('Check in');
      await screen.findByText(/Checked in 09:10/);
      await screen.unmount();

      // B signs in on the same phone, and the mirror is B's now.
      await db.run('update mirror_state set user_id = ?', [USER_B]);
      await show(fakeLocation({}), USER_B);

      await screen.findByRole('button', { name: 'Check in' });
      expect(screen.queryByText(/Checked in 09:10/)).toBeNull();
    });
  });
});

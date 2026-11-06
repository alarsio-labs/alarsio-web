import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import type { PickResult } from '../../reports/photo-device';
import type { PhotoFiles } from '../../reports/photo-store';
import { runPhotoUploads, type PhotoStorage } from '../../reports/photo-upload';
import { saveReport } from '../../reports/report-store';
import { applyVerdicts, claimBatch } from '../../sync/outbox';
import { DailyReportScreen } from '../DailyReportScreen';

// The header title is set through expo-router, which Jest does not load.
jest.mock('expo-router', () => ({ Stack: { Screen: jest.fn(() => null) } }));

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `adadadad-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-20T12:30:00.000Z');
const TODAY = '2026-10-20';
const FULL = { headcount: '12', workDone: 'Slab', blockers: '', seriousBlocker: false, safetyIncident: false, nextDayPlan: '' };

async function seedSite(db: DeviceDb, user: string) {
  await db.run(
    `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
     values (?, ?, 'Kothrud', 'Pune', 18.5204, 73.8567, 200, 'active')`,
    [SITE, ORG],
  );
  await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [user, NOW.toISOString()]);
}

function fakeFiles(size = 90_000): PhotoFiles & { kept: Map<string, number> } {
  const kept = new Map<string, number>();
  return {
    kept,
    async keep(_s, photoId) {
      const uri = `file:///app/report-photos/${photoId}.jpg`;
      kept.set(uri, size);
      return { uri, sizeBytes: size };
    },
    async read(uri) {
      return new Uint8Array(kept.get(uri) ?? 0);
    },
    async remove(uri) {
      kept.delete(uri);
    },
  };
}

describe('DailyReportScreen photos (#81 PR 2)', () => {
  let db: DeviceDb;
  let files: ReturnType<typeof fakeFiles>;
  let picks: PickResult[];
  let asked: string[];
  // When set, a pick waits for it: the camera is "open" until the test releases it.
  let gate: Promise<void> | null;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    files = fakeFiles();
    picks = [{ kind: 'picked', uri: 'file:///cache/p.jpg' }];
    asked = [];
    gate = null;
  });

  const show = async (userId = USER_A) =>
    render(
      <DailyReportScreen
        openDb={() => Promise.resolve(db)}
        userId={userId}
        siteId={SITE}
        now={() => NOW}
        pollMs={50}
        photos={{
          files,
          pick: async (source) => {
            asked.push(source);
            if (gate) await gate;
            return picks.shift() ?? { kind: 'cancelled' };
          },
        }}
      />,
    );
  const press = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));
  const saveToday = (user = USER_A) =>
    saveReport(db, user, { id: SITE, orgId: ORG }, TODAY, FULL, 'draft', {}, NOW);

  it('offers the photo buttons before the report is saved, and no longer says to save first', async () => {
    await seedSite(db, USER_A);
    await show();
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeTruthy();
    expect(screen.queryByText('Save the report first, then add photos.')).toBeNull();
  });

  it('a photo on a new report saves one draft and one photo row, with no signal', async () => {
    await seedSite(db, USER_A);
    await show();
    await press('Take photo');

    await screen.findByText(/Photo 1 · Saved on this phone, waiting to send/);
    const reports = await db.all<{ payload: string }>(`select payload from outbox where entity = 'daily_reports'`);
    expect(reports).toHaveLength(1);
    expect(JSON.parse(reports[0]!.payload)).toMatchObject({ status: 'draft', site_id: SITE, report_date: TODAY });
    expect(await db.all(`select * from outbox where entity = 'report_photos'`)).toHaveLength(1);
  });

  it('keeps what was already typed in the draft the photo creates', async () => {
    await seedSite(db, USER_A);
    await show();
    fireEvent.changeText(await screen.findByLabelText('Work done'), 'Slab shuttering');
    await press('Take photo');

    await screen.findByText(/Photo 1/);
    const [row] = await db.all<{ payload: string }>(`select payload from outbox where entity = 'daily_reports'`);
    expect(JSON.parse(row!.payload)).toMatchObject({ work_done: 'Slab shuttering', status: 'draft' });
  });

  it('a cancelled pick creates no draft', async () => {
    await seedSite(db, USER_A);
    picks = [{ kind: 'cancelled' }];
    await show();
    await press('Take photo');

    await waitFor(() => expect(asked).toEqual(['camera']));
    expect(await db.all(`select * from outbox`)).toHaveLength(0);
  });

  it('a denied pick creates no draft and says how to allow access', async () => {
    await seedSite(db, USER_A);
    picks = [{ kind: 'denied' }];
    await show();
    await press('Take photo');

    expect(await screen.findByText("Allow access in your phone's settings to add a photo.")).toBeTruthy();
    expect(await db.all(`select * from outbox`)).toHaveLength(0);
  });

  it('a second tap while the camera is open adds nothing: one draft and one photo', async () => {
    await seedSite(db, USER_A);
    picks = [
      { kind: 'picked', uri: 'file:///cache/one.jpg' },
      { kind: 'picked', uri: 'file:///cache/two.jpg' },
    ];
    let release: () => void = () => undefined;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await show();
    const button = await screen.findByRole('button', { name: 'Take photo' });
    await fireEvent.press(button);
    await fireEvent.press(button); // the first pick is still open
    release();

    await screen.findByText(/Photo 1/);
    expect(asked).toEqual(['camera']);
    expect(await db.all(`select * from outbox where entity = 'daily_reports'`)).toHaveLength(1);
    expect(await db.all(`select * from outbox where entity = 'report_photos'`)).toHaveLength(1);
  });

  it('adds a photo from the camera with no signal, and shows it waiting to send (AC 1, 5)', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    await show();
    await press('Take photo');

    await screen.findByText(/Photo 1 · Saved on this phone, waiting to send/);
    expect(asked).toEqual(['camera']);
    expect(files.kept.size).toBe(1);
    expect((await db.all(`select * from outbox where entity = 'report_photos'`)).length).toBe(1);
  });

  it('adds one from the gallery too', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    await show();
    await press('Choose photo');
    await screen.findByText(/Photo 1 ·/);
    expect(asked).toEqual(['library']);
  });

  it('does not touch the report when a photo is added (AC 2)', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    await show();
    const before = await db.all(`select payload, status from outbox where entity = 'daily_reports'`);
    await press('Take photo');
    await screen.findByText(/Photo 1 ·/);
    expect(await db.all(`select payload, status from outbox where entity = 'daily_reports'`)).toEqual(before);
  });

  it('says what to do when the camera is denied, and saves nothing', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    picks = [{ kind: 'denied' }];
    await show();
    await press('Take photo');

    await screen.findByText(/Allow access in your phone's settings/);
    expect(files.kept.size).toBe(0);
  });

  it('says nothing and saves nothing when the supervisor cancels', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    picks = [{ kind: 'cancelled' }];
    await show();
    await press('Take photo');
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText(/Photo 1/)).toBeNull();
    expect(files.kept.size).toBe(0);
  });

  it('stops offering photos at ten and says why (AC 4)', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    picks = Array.from({ length: 10 }, () => ({ kind: 'picked' as const, uri: 'file:///cache/p.jpg' }));
    await show();
    for (let i = 1; i <= 10; i += 1) {
      await press('Take photo');
      await screen.findByText(new RegExp(`Photo ${i} ·`));
    }
    await screen.findByText('A report can have 10 photos at most.');
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
    expect(files.kept.size).toBe(10);
  });

  it('refuses a photo over 10 MB with a fixed sentence, and keeps nothing (AC 4)', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    files = fakeFiles(10_485_761);
    await show();
    await press('Take photo');

    await screen.findByText('This photo is too large, even after compressing it. Try another.');
    expect(files.kept.size).toBe(0);
    expect(screen.queryByText(/Photo 1/)).toBeNull();
  });

  it('says "On the server" for a photo only after its file is uploaded, never before (AC 3)', async () => {
    await seedSite(db, USER_A);
    const reportId = await saveToday();
    await show();
    await press('Take photo');
    await screen.findByText(/Photo 1 · Saved on this phone, waiting to send/);

    const [row] = await db.all<{ record_id: string }>(`select record_id from outbox where entity = 'report_photos'`);
    await claimBatch(db, USER_A, NOW);
    await applyVerdicts(db, [{ entity: 'report_photos', record_id: row!.record_id, verdict: 'accepted', reason: null }], NOW);
    await screen.findByText(/Photo 1 · Photo waiting to upload/);
    expect(screen.queryByText(/On the server/)).toBeNull();

    const storage: PhotoStorage = { upload: async () => 'uploaded' };
    await runPhotoUploads(db, USER_A, storage, files, NOW);
    await screen.findByText(/Photo 1 · On the server/);
    expect(reportId).toBeTruthy();
  });

  it("shows user B none of user A's photos (AC 6)", async () => {
    await seedSite(db, USER_B);
    await saveToday(USER_A);
    await show(USER_B);
    await screen.findByRole('button', { name: 'Take photo' });
    expect(screen.queryByText(/Photo 1/)).toBeNull();
  });

  it('shows no photo section when the screen is given no photo support', async () => {
    await seedSite(db, USER_A);
    await saveToday();
    await render(<DailyReportScreen openDb={() => Promise.resolve(db)} userId={USER_A} siteId={SITE} now={() => NOW} pollMs={50} />);
    await screen.findByRole('button', { name: 'Submit' });
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
    expect(screen.queryByText('Save the report first, then add photos.')).toBeNull();
  });
});

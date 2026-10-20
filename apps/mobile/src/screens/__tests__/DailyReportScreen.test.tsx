import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { saveReport } from '../../reports/report-store';
import type { SyncResultRow } from '../../sync/entities';
import { applyVerdicts, claimBatch } from '../../sync/outbox';
import { DailyReportScreen } from '../DailyReportScreen';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `eeeeeeee-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

// A cold CI runner (no transform cache, sql.js starting up) needs more than Jest's 5 s for the
// first test and RNTL's 1 s for a button to appear. Both are limits on waiting, not on speed.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 8_000 });

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-20T12:30:00.000Z'); // 18:00 IST
const TODAY = '2026-10-20';

async function seedSite(db: DeviceDb, user: string, orgId: string | null = ORG) {
  await db.run(
    `insert into mirror_sites (id, org_id, name, address, latitude, longitude, geofence_radius_m, status)
     values (?, ?, 'Kothrud', 'Pune', 18.5204, 73.8567, 200, 'active')`,
    [SITE, orgId],
  );
  await db.run(`insert into mirror_state (id, user_id, refreshed_at) values (1, ?, ?)`, [user, NOW.toISOString()]);
}

const outboxRows = (db: DeviceDb) =>
  db.all<{ record_id: string; author_id: string; status: string; payload: string }>(
    'select record_id, author_id, status, payload from outbox order by seq',
  );

/** What the sender does when the server answers: claim the batch, apply the verdicts. */
async function serverAnswers(db: DeviceDb, user: string, recordId: string, v: SyncResultRow['verdict'], reason: string | null = null) {
  await claimBatch(db, user, NOW);
  await applyVerdicts(db, [{ entity: 'daily_reports', record_id: recordId, verdict: v, reason }], NOW);
}

const FULL = { headcount: '12', workDone: 'Slab poured on level 2', blockers: '', seriousBlocker: false, safetyIncident: false, nextDayPlan: '' };

describe('DailyReportScreen (#81)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const show = async (userId = USER_A, date?: string) =>
    render(
      <DailyReportScreen
        openDb={() => Promise.resolve(db)}
        userId={userId}
        siteId={SITE}
        date={date}
        now={() => NOW}
        pollMs={50}
      />,
    );

  const press = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));
  const type = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);

  describe('with no signal (AC 1, 2)', () => {
    it('saves a draft to the phone and never says it was submitted', async () => {
      await seedSite(db, USER_A);
      await show();
      await type('Headcount', '12');
      await type('Blockers', 'Sand arrived late');
      await press('Save draft');

      await screen.findByText('Saved on this phone, waiting to send');
      expect(screen.queryByText(/^Submitted$/)).toBeNull();
      const rows = await outboxRows(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ author_id: USER_A, status: 'pending' });
      expect(JSON.parse(rows[0]!.payload)).toMatchObject({
        org_id: ORG,
        site_id: SITE,
        report_date: TODAY,
        status: 'draft',
        headcount: 12,
        blockers: 'Sand arrived late',
      });
    });

    it('shows the draft again, as typed, after the app is closed and reopened', async () => {
      await seedSite(db, USER_A);
      const first = await show();
      await type('Headcount', '9');
      await type('Work done', 'Shuttering for columns');
      await press('Save draft');
      await screen.findByText('Saved on this phone, waiting to send');
      await first.unmount();

      await show();
      expect((await screen.findByLabelText('Headcount')).props.value).toBe('9');
      expect(screen.getByLabelText('Work done').props.value).toBe('Shuttering for columns');
    });

    it('says "Submitted" only once the server accepts the submit', async () => {
      await seedSite(db, USER_A);
      await show();
      await type('Headcount', '12');
      await type('Work done', 'Slab poured on level 2');
      await press('Submit');

      await screen.findByText('Saved on this phone, waiting to send');
      expect(screen.queryByText('Submitted')).toBeNull();

      const [row] = await outboxRows(db);
      expect(JSON.parse(row!.payload)).toMatchObject({ status: 'submitted' });
      await serverAnswers(db, USER_A, row!.record_id, 'accepted');
      await screen.findByText('Submitted');
    });
  });

  describe('bad input writes nothing (AC 4)', () => {
    it('refuses an empty submit and says what is missing', async () => {
      await seedSite(db, USER_A);
      await show();
      await press('Submit');

      await screen.findByText('Enter the headcount to submit.');
      expect(await outboxRows(db)).toHaveLength(0);
    });

    it.each([['abc'], ['-3'], ['99999']])('refuses the headcount %p', async (headcount) => {
      await seedSite(db, USER_A);
      await show();
      await type('Headcount', headcount);
      await type('Work done', 'Plastering');
      await press('Submit');

      await screen.findByText('Enter the headcount as a whole number from 0 to 1000.');
      expect(await outboxRows(db)).toHaveLength(0);
    });

    it('refuses work done over 4000 characters', async () => {
      await seedSite(db, USER_A);
      await show();
      await type('Headcount', '5');
      await type('Work done', 'x'.repeat(4001));
      await press('Submit');

      await screen.findByText('Keep the work done to 4000 characters or fewer.');
      expect(await outboxRows(db)).toHaveLength(0);
    });
  });

  describe('serious blocker and safety incident (AC 6)', () => {
    it('marks the report as flagged before it is submitted', async () => {
      await seedSite(db, USER_A);
      await show();
      expect(screen.queryByText(/will be flagged to your managers/)).toBeNull();

      await fireEvent(await screen.findByRole('switch', { name: 'Safety incident' }), 'valueChange', true);
      await screen.findByText(/will be flagged to your managers/);
    });

    it('asks for the blocker text when a serious blocker is switched on', async () => {
      await seedSite(db, USER_A);
      await show();
      await type('Headcount', '12');
      await type('Work done', 'Slab');
      await fireEvent(await screen.findByRole('switch', { name: 'Serious blocker' }), 'valueChange', true);
      await press('Submit');

      await screen.findByText('Describe the serious blocker.');
      expect(await outboxRows(db)).toHaveLength(0);

      await type('Blockers', 'Crane down since noon');
      await press('Submit');
      await screen.findByText('Saved on this phone, waiting to send');
      expect(JSON.parse((await outboxRows(db))[0]!.payload)).toMatchObject({ serious_blocker: true, blockers: 'Crane down since noon' });
    });
  });

  describe('changing a submitted report (AC 5)', () => {
    it('asks for a reason, offers no draft, and sends the reason with the change', async () => {
      await seedSite(db, USER_A);
      const recordId = await saveReport(db, USER_A, { id: SITE, orgId: ORG }, TODAY, FULL, 'submitted', {}, NOW);
      await serverAnswers(db, USER_A, recordId, 'accepted');
      await show();
      await screen.findByText('Submitted');

      expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
      await type('Headcount', '14');
      await press('Send changes');
      await screen.findByText('Say why you are changing a submitted report.');

      await type('Reason for the change', 'Two came late');
      await press('Send changes');
      await screen.findByText('Saved on this phone, waiting to send');
      const [row] = await outboxRows(db);
      expect(row).toMatchObject({ record_id: recordId, status: 'pending' });
      expect(JSON.parse(row!.payload)).toMatchObject({ headcount: 14, edit_reason: 'Two came late' });
    });

    it('keeps a reviewed report read-only', async () => {
      await seedSite(db, USER_A);
      const recordId = await saveReport(db, USER_A, { id: SITE, orgId: ORG }, TODAY, FULL, 'submitted', {}, NOW);
      await serverAnswers(db, USER_A, recordId, 'conflict', 'reviewed');
      await show();

      await screen.findByText(/A manager already reviewed this report/);
      expect(screen.queryByRole('button', { name: 'Send changes' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
      expect(screen.getByLabelText('Headcount').props.editable).toBe(false);
    });
  });

  describe('server answers in plain words (AC 8)', () => {
    it('says another report for the site and day is already there', async () => {
      await seedSite(db, USER_A);
      const recordId = await saveReport(db, USER_A, { id: SITE, orgId: ORG }, TODAY, FULL, 'submitted', {}, NOW);
      await serverAnswers(db, USER_A, recordId, 'conflict', 'duplicate');
      await show();

      await screen.findByText(/Another report for this site and day is already on the server/);
    });
  });

  describe('whose report (AC 7)', () => {
    it("shows user B an empty form, not user A's report for the same site and day", async () => {
      await seedSite(db, USER_B);
      await saveReport(db, USER_A, { id: SITE, orgId: ORG }, TODAY, FULL, 'submitted', {}, NOW);
      await show(USER_B);

      expect((await screen.findByLabelText('Headcount')).props.value).toBe('');
      expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy();
      expect(screen.queryByText('Saved on this phone, waiting to send')).toBeNull();
    });

    it("says the site is not on the phone when the mirror is someone else's", async () => {
      await seedSite(db, USER_A);
      await show(USER_B);

      await screen.findByText(/This site is not on this phone/);
      expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    });
  });

  it('asks for a refresh, and saves nothing, for a site pulled before its organisation was known', async () => {
    await seedSite(db, USER_A, null);
    await show();
    await screen.findByText(/Connect once to refresh your sites/);
    await type('Headcount', '3');
    await press('Save draft');

    await waitFor(async () => expect(await outboxRows(db)).toHaveLength(0));
    expect(screen.getAllByText(/Connect once to refresh your sites/).length).toBeGreaterThan(0);
  });

  it('opens an earlier day it is given, and today for a day in the future', async () => {
    await seedSite(db, USER_A);
    await show(USER_A, '2026-10-18');
    await screen.findByText('Report for 18 Oct');

    await screen.unmount();
    await show(USER_A, '2026-10-25');
    await screen.findByText('Report for today, 20 Oct');
  });
});

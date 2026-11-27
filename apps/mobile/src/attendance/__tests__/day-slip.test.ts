import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import i18n from '../../i18n';
import { saveReport } from '../../reports/report-store';
import { enqueue } from '../../sync/outbox';
import { buildDaySlip } from '../day-slip';
import { checkInVisit, checkOutVisit, type Placement } from '../visit';
import { findOpenVisit, saveCheckIn, saveCheckOut } from '../visit-store';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `cccccccc-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG, name: 'Site A' };
const DAY = '2026-10-20';
const HERE: Placement = { kind: 'located', lat: 18.5204, lng: 73.8567, reason: null };
const T_IN = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST
const T_OUT = new Date('2026-10-20T12:00:00.000Z'); // 17:30 IST

const worker = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n: number, status: string) => ({
  org_id: ORG,
  site_id: SITE.id,
  attendance_date: DAY,
  worker_id: worker(n),
  status,
  overtime_hours: 0,
  note: null,
});

describe('day slip (#183)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  const mark = (n: number, status: string, user = USER_A) =>
    enqueue(db, { entity: 'attendance_entries', recordId: `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`, authorId: user, payload: entry(n, status) }, T_IN);

  it('says what the phone knows of the day: visit, headcount and report', async () => {
    const recordId = await saveCheckIn(db, USER_A, checkInVisit(SITE, HERE, T_IN), T_IN);
    const open = await findOpenVisit(db, USER_A, SITE.id);
    await saveCheckOut(db, USER_A, recordId, checkOutVisit(open!.visit, HERE, T_OUT), T_OUT);
    await mark(1, 'present');
    await mark(2, 'present');
    await mark(3, 'half_day');
    await saveReport(db, USER_A, SITE, DAY, { headcount: '3', workDone: 'Slab', blockers: '', seriousBlocker: false, safetyIncident: false, nextDayPlan: '' }, 'draft', {}, T_OUT);

    expect(await buildDaySlip(db, USER_A, SITE, DAY)).toBe(
      ['Site A · 20 Oct', 'Checked in 09:10 · Checked out 17:30', 'On site: 3 · 1 on a half day', 'Daily report: Draft, saved on this phone'].join('\n'),
    );
  });

  it('says so when the day has no check-in, no attendance and no report', async () => {
    expect(await buildDaySlip(db, USER_A, SITE, DAY)).toBe(
      ['Site A · 20 Oct', 'No check-in', 'Attendance not marked', `Daily report: ${i18n.t('dailyReport.status.notStarted')}`].join('\n'),
    );
  });

  it('leaves out another day and another user', async () => {
    await saveCheckIn(db, USER_A, checkInVisit(SITE, HERE, new Date('2026-10-19T03:40:00.000Z')), T_IN);
    await saveCheckIn(db, USER_B, checkInVisit(SITE, HERE, T_IN), T_IN);
    await mark(1, 'present', USER_B);

    const slip = await buildDaySlip(db, USER_A, SITE, DAY);

    expect(slip).toContain('No check-in');
    expect(slip).toContain('Attendance not marked');
  });
});

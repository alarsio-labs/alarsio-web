import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import type { SyncResultRow } from '../../sync/entities';
import { applyVerdicts, claimBatch, getStatus } from '../../sync/outbox';
import { ReportError, type ReportFields } from '../report';
import { findReport, listUnfinished, saveReport } from '../report-store';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `dddddddd-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE_1 = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG };
const SITE_2 = { id: '51000000-0000-4000-8000-000000000002', orgId: ORG };
const TODAY = '2026-10-20';
const YESTERDAY = '2026-10-19';
const T = new Date('2026-10-20T12:30:00.000Z'); // 18:00 IST
const at = (seconds: number) => new Date(T.getTime() + seconds * 1000);

const fields = (over: Partial<ReportFields> = {}): ReportFields => ({
  headcount: '12',
  workDone: 'Slab poured on level 2',
  blockers: '',
  seriousBlocker: false,
  safetyIncident: false,
  nextDayPlan: '',
  ...over,
});

const verdict = (recordId: string, v: SyncResultRow['verdict'], reason: string | null = null): SyncResultRow => ({
  entity: 'daily_reports',
  record_id: recordId,
  verdict: v,
  reason,
});

/** What the sender does: claim this user's batch, then apply the server's answers. */
async function serverAnswers(db: DeviceDb, user: string, answers: SyncResultRow[], when = at(1)) {
  await claimBatch(db, user, when);
  await applyVerdicts(db, answers, when);
}

const outboxRows = (db: DeviceDb) =>
  db.all<{ entity: string; record_id: string; author_id: string; status: string; payload: string }>(
    'select entity, record_id, author_id, status, payload from outbox order by seq',
  );

describe('report store (#81)', () => {
  let db: DeviceDb;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
  });

  it('saves a draft as one pending daily_reports row, owned by its author, under a phone-made uuid', async () => {
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '' }), 'draft', {}, T);

    const rows = await outboxRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: 'daily_reports', record_id: recordId, author_id: USER_A, status: 'pending' });
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({
      org_id: ORG,
      site_id: SITE_1.id,
      report_date: TODAY,
      status: 'draft',
      headcount: null,
    });
  });

  it('finds the draft again after the app is closed and reopened, with what was typed', async () => {
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields({ blockers: 'Sand late' }), 'draft', {}, T);

    // A fresh read over the same database is what a restarted app does.
    const found = await findReport(db, USER_A, SITE_1.id, TODAY);
    expect(found).toMatchObject({ recordId, status: 'pending', reason: null });
    expect(found?.report).toMatchObject({ status: 'draft', headcount: 12, blockers: 'Sand late' });
  });

  it('keeps one record per site and day: saving again re-saves the same id', async () => {
    const first = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'draft', {}, T);
    const again = await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '13' }), 'draft', {}, at(5));
    const submit = await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '13' }), 'submitted', {}, at(9));

    expect(again).toBe(first);
    expect(submit).toBe(first);
    const rows = await outboxRows(db);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({ status: 'submitted', headcount: 13, edit_reason: null });
  });

  it('starts a new record for another site or another day', async () => {
    const a = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'draft', {}, T);
    const b = await saveReport(db, USER_A, SITE_2, TODAY, fields(), 'draft', {}, T);
    const c = await saveReport(db, USER_A, SITE_1, YESTERDAY, fields(), 'draft', {}, T);

    expect(new Set([a, b, c]).size).toBe(3);
    expect((await findReport(db, USER_A, SITE_1.id, YESTERDAY))?.recordId).toBe(c);
  });

  it('writes nothing for a report the rules refuse', async () => {
    const empty = saveReport(db, USER_A, SITE_1, TODAY, fields({ workDone: '' }), 'submitted', {}, T);
    await expect(empty).rejects.toMatchObject({ code: 'work_done_required' });
    const noOrg = saveReport(db, USER_A, { id: SITE_1.id, orgId: null }, TODAY, fields(), 'draft', {}, T);
    await expect(noOrg).rejects.toBeInstanceOf(ReportError);

    expect(await outboxRows(db)).toHaveLength(0);
  });

  it('asks for a reason to change a report that was submitted, even one the server has not answered yet', async () => {
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'submitted', {}, T);

    const noReason = saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '14' }), 'submitted', {}, at(5));
    await expect(noReason).rejects.toMatchObject({ code: 'reason_required' });

    await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '14' }), 'submitted', { reason: 'Two came late' }, at(9));
    const [row] = await outboxRows(db);
    expect(row).toMatchObject({ record_id: recordId, status: 'pending' });
    expect(JSON.parse(row!.payload)).toMatchObject({ headcount: 14, edit_reason: 'Two came late' });
  });

  it('sends an edit after the server accepted the submit: the row is pending again with the reason', async () => {
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'submitted', {}, T);
    await serverAnswers(db, USER_A, [verdict(recordId, 'accepted')]);
    expect((await getStatus(db, 'daily_reports', recordId))?.status).toBe('synced');

    await saveReport(db, USER_A, SITE_1, TODAY, fields({ safetyIncident: true }), 'submitted', { reason: 'Missed a fall' }, at(30));

    expect(await getStatus(db, 'daily_reports', recordId)).toEqual({ status: 'pending', reason: null });
    expect(JSON.parse((await outboxRows(db))[0]!.payload)).toMatchObject({
      safety_incident: true,
      edit_reason: 'Missed a fall',
    });
  });

  it('refuses to change a report a manager already reviewed, and writes nothing', async () => {
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'submitted', {}, T);
    await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '14' }), 'submitted', { reason: 'Late' }, at(5));
    await serverAnswers(db, USER_A, [verdict(recordId, 'conflict', 'reviewed')], at(10));
    const before = await outboxRows(db);

    const edit = saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '15' }), 'submitted', { reason: 'Again' }, at(20));
    await expect(edit).rejects.toMatchObject({ code: 'reviewed' });
    expect(await outboxRows(db)).toEqual(before);
  });

  it('resends a sent-back report with only a reason, under the same id (#114, ADR-042)', async () => {
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'submitted', {}, T);
    await serverAnswers(db, USER_A, [verdict(recordId, 'accepted')]);
    // The phone learns of the send-back when it pushes again: here, an edit.
    await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '14' }), 'submitted', { reason: 'Late' }, at(20));
    await serverAnswers(db, USER_A, [verdict(recordId, 'conflict', 'sent_back')], at(25));

    // Nothing else changed: the count was right. A reason alone answers it.
    await expect(saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '14' }), 'submitted', {}, at(30))).rejects.toMatchObject({
      code: 'reason_required',
    });
    await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '14' }), 'submitted', { reason: '14 is right' }, at(40));
    expect(await getStatus(db, 'daily_reports', recordId)).toEqual({ status: 'pending', reason: null });
    const [row] = await outboxRows(db);
    expect(JSON.parse(row?.payload ?? '{}')).toMatchObject({ status: 'submitted', headcount: 14, edit_reason: '14 is right' });
  });

  it('resends an accepted report unchanged with a reason, before the phone knows it was sent back', async () => {
    // The usual case: the last answer was accepted, and the author saw the send-back on the web.
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'submitted', {}, T);
    await serverAnswers(db, USER_A, [verdict(recordId, 'accepted')]);

    await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'submitted', { reason: '12 is right' }, at(20));
    expect(await getStatus(db, 'daily_reports', recordId)).toEqual({ status: 'pending', reason: null });
    const [row] = await outboxRows(db);
    expect(JSON.parse(row?.payload ?? '{}')).toMatchObject({ status: 'submitted', headcount: 12, edit_reason: '12 is right' });
  });

  it('lets a refused report be fixed and sent again under the same id', async () => {
    const recordId = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'draft', {}, T);
    await serverAnswers(db, USER_A, [verdict(recordId, 'rejected', 'invalid_input')]);

    await saveReport(db, USER_A, SITE_1, TODAY, fields({ headcount: '11' }), 'draft', {}, at(30));
    expect(await getStatus(db, 'daily_reports', recordId)).toEqual({ status: 'pending', reason: null });
  });

  describe('on a shared phone (ADR-020)', () => {
    it("never finds another user's report, and starts the second user's own record", async () => {
      const mine = await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'submitted', {}, T);

      expect(await findReport(db, USER_B, SITE_1.id, TODAY)).toBeNull();
      expect(await listUnfinished(db, USER_B, '2026-10-21')).toEqual([]);

      // B's report for the same site and day is B's own record: the server answers
      // the second one with conflict / duplicate, and A's row is untouched.
      const theirs = await saveReport(db, USER_B, SITE_1, TODAY, fields(), 'draft', {}, at(5));
      expect(theirs).not.toBe(mine);
      const rows = await outboxRows(db);
      expect(rows.map((r) => [r.record_id, r.author_id])).toEqual([
        [mine, USER_A],
        [theirs, USER_B],
      ]);
    });

    it('finds nothing without a user', async () => {
      await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'draft', {}, T);
      expect(await findReport(db, '', SITE_1.id, TODAY)).toBeNull();
      expect(await listUnfinished(db, '', TODAY)).toEqual([]);
    });
  });

  describe('unfinished reports from earlier days (D2)', () => {
    it('lists earlier drafts and refused reports, newest first, and leaves out today, the finished and the reviewed', async () => {
      const reviewed = await saveReport(db, USER_A, SITE_2, '2026-10-16', fields(), 'submitted', {}, T);
      const oldDraft = await saveReport(db, USER_A, SITE_1, '2026-10-17', fields(), 'draft', {}, T);
      const refused = await saveReport(db, USER_A, SITE_2, '2026-10-18', fields(), 'submitted', {}, at(1));
      const done = await saveReport(db, USER_A, SITE_1, YESTERDAY, fields(), 'submitted', {}, at(2));
      const waiting = await saveReport(db, USER_A, SITE_2, YESTERDAY, fields(), 'submitted', {}, at(3));
      await saveReport(db, USER_A, SITE_1, TODAY, fields(), 'draft', {}, at(4));
      await serverAnswers(db, USER_A, [
        // A reviewed report is final, so it is finished, not "Not finished".
        verdict(reviewed, 'conflict', 'reviewed'),
        verdict(oldDraft, 'accepted'),
        verdict(refused, 'conflict', 'duplicate'),
        verdict(done, 'accepted'),
        verdict(waiting, 'retryable_error', 'missing_parent'),
      ], at(10));

      const unfinished = await listUnfinished(db, USER_A, TODAY);
      expect(unfinished.map((u) => [u.recordId, u.report.reportDate])).toEqual([
        [refused, '2026-10-18'],
        [oldDraft, '2026-10-17'],
      ]);
    });
  });
});

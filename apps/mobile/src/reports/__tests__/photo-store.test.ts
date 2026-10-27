import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { readUserVersion } from '../../db/run-migrations';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { applyVerdicts, claimBatch, getStatus } from '../../sync/outbox';
import { PHOTO_LIMITS, PhotoError } from '../photo';
import { addPhoto, listPhotos, type PhotoFiles } from '../photo-store';
import { saveReport, type StoredReport } from '../report-store';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `abababab-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG };
const DAY = '2026-10-20';
const T = new Date('2026-10-20T12:30:00.000Z');
const FIELDS = { headcount: '12', workDone: 'Slab', blockers: '', seriousBlocker: false, safetyIncident: false, nextDayPlan: '' };

/** The app's own folder on the phone, in memory: what was kept, and what was removed. */
function fakeFiles(size = 250_000): PhotoFiles & { kept: Map<string, number>; removed: string[] } {
  const kept = new Map<string, number>();
  const removed: string[] = [];
  return {
    kept,
    removed,
    async keep(_source, photoId) {
      const uri = `file:///app/report-photos/${photoId}.jpg`;
      kept.set(uri, size);
      return { uri, sizeBytes: size };
    },
    async read(uri) {
      return new Uint8Array(kept.get(uri) ?? 0);
    },
    async remove(uri) {
      kept.delete(uri);
      removed.push(uri);
    },
  };
}

const photoRows = (db: DeviceDb) =>
  db.all<{ record_id: string; author_id: string; report_id: string; storage_path: string; size_bytes: number; state: string }>(
    'select record_id, author_id, report_id, storage_path, size_bytes, state from report_photo_files order by created_at, record_id',
  );
const outboxPhotos = (db: DeviceDb) =>
  db.all<{ record_id: string; author_id: string; status: string; payload: string; seq: number }>(
    `select record_id, author_id, status, payload, seq from outbox where entity = 'report_photos' order by seq`,
  );

describe('photo store (#81 PR 2)', () => {
  let db: DeviceDb;
  let report: StoredReport;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    const recordId = await saveReport(db, USER_A, SITE, DAY, FIELDS, 'draft', {}, T);
    report = {
      recordId,
      status: 'pending',
      reason: null,
      report: {
        orgId: ORG,
        siteId: SITE.id,
        reportDate: DAY,
        status: 'draft',
        headcount: 12,
        workDone: 'Slab',
        blockers: null,
        seriousBlocker: false,
        safetyIncident: false,
        nextDayPlan: null,
        editReason: null,
      },
    };
  });

  it('device migration 6 adds the upload queue, and a phone on version 5 upgrades in place', async () => {
    expect(await readUserVersion(db)).toBe(7);
    expect(deviceMigrations.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(await photoRows(db)).toEqual([]);
  });

  it('keeps the file in the app folder, queues it, and saves the metadata after its report', async () => {
    const files = fakeFiles();
    const photoId = await addPhoto(db, USER_A, report, 'file:///cache/picked.jpg', files, T);

    expect(files.kept.has(`file:///app/report-photos/${photoId}.jpg`)).toBe(true);
    const [row] = await photoRows(db);
    expect(row).toEqual({
      record_id: photoId,
      author_id: USER_A,
      report_id: report.recordId,
      storage_path: `${ORG}/${SITE.id}/${report.recordId}/${photoId}.jpg`,
      size_bytes: 250_000,
      state: 'waiting',
    });

    const [photo] = await outboxPhotos(db);
    expect(photo).toMatchObject({ record_id: photoId, author_id: USER_A, status: 'pending' });
    expect(JSON.parse(photo!.payload)).toEqual({
      report_id: report.recordId,
      storage_path: `${ORG}/${SITE.id}/${report.recordId}/${photoId}.jpg`,
      size_bytes: 250_000,
      content_type: 'image/jpeg',
      caption: null,
    });
    // The report was saved first, so the outbox sends it first (ADR-016).
    const [reportRow] = await db.all<{ seq: number }>(`select seq from outbox where entity = 'daily_reports'`);
    expect(reportRow!.seq).toBeLessThan(photo!.seq);
  });

  it('lists the photos of a report with where each stands, after a restart too', async () => {
    const files = fakeFiles();
    const first = await addPhoto(db, USER_A, report, 'file:///cache/1.jpg', files, T);
    const second = await addPhoto(db, USER_A, report, 'file:///cache/2.jpg', files, new Date(T.getTime() + 1000));
    await claimBatch(db, USER_A, T);
    await applyVerdicts(db, [{ entity: 'report_photos', record_id: first, verdict: 'retryable_error', reason: 'missing_parent' }], T);

    // A fresh read over the same database is what a restarted app does.
    const photos = await listPhotos(db, USER_A, report.recordId);
    expect(photos.map((p) => [p.recordId, p.outbox, p.reason, p.state])).toEqual([
      [first, 'failed', 'missing_parent', 'waiting'],
      [second, 'syncing', null, 'waiting'],
    ]);
  });

  it(`refuses an ${PHOTO_LIMITS.perReport + 1}th photo and writes nothing`, async () => {
    const files = fakeFiles();
    for (let i = 0; i < PHOTO_LIMITS.perReport; i += 1) {
      await addPhoto(db, USER_A, report, `file:///cache/${i}.jpg`, files, new Date(T.getTime() + i));
    }
    const before = (await outboxPhotos(db)).length;

    await expect(addPhoto(db, USER_A, report, 'file:///cache/11.jpg', files, T)).rejects.toMatchObject({ code: 'too_many' });
    expect((await outboxPhotos(db)).length).toBe(before);
    expect(await photoRows(db)).toHaveLength(PHOTO_LIMITS.perReport);
  });

  it('refuses a file over 10 MB or an empty one, removes the copy, and writes nothing', async () => {
    for (const size of [PHOTO_LIMITS.maxBytes + 1, 0]) {
      const files = fakeFiles(size);
      await expect(addPhoto(db, USER_A, report, 'file:///cache/big.jpg', files, T)).rejects.toBeInstanceOf(PhotoError);
      expect(files.kept.size).toBe(0);
    }
    expect(await outboxPhotos(db)).toEqual([]);
    expect(await photoRows(db)).toEqual([]);
  });

  it('takes a photo of exactly 10 MB', async () => {
    await addPhoto(db, USER_A, report, 'file:///cache/edge.jpg', fakeFiles(PHOTO_LIMITS.maxBytes), T);
    expect(await photoRows(db)).toHaveLength(1);
  });

  it('refuses a report the phone has not saved, and writes nothing', async () => {
    const unsaved = { ...report, recordId: 'dddddddd-0000-4000-8000-00000000ffff' };
    await expect(addPhoto(db, USER_A, unsaved, 'file:///cache/x.jpg', fakeFiles(), T)).rejects.toMatchObject({
      code: 'report_not_saved',
    });
    expect(await photoRows(db)).toEqual([]);
  });

  it("builds the path from the phone's own record of the report, not from what the caller passes", async () => {
    const forged = {
      ...report,
      report: { ...report.report, orgId: '0b0b0b0b-0000-4000-8000-0000000000b2', siteId: '51000000-0000-4000-8000-0000000000ff' },
    };
    const photoId = await addPhoto(db, USER_A, forged, 'file:///cache/x.jpg', fakeFiles(), T);
    const [row] = await photoRows(db);
    expect(row!.storage_path).toBe(`${ORG}/${SITE.id}/${report.recordId}/${photoId}.jpg`);
  });

  it('takes a photo after the report is submitted and even after it was reviewed (ADR-013 R8)', async () => {
    await claimBatch(db, USER_A, T);
    await applyVerdicts(db, [{ entity: 'daily_reports', record_id: report.recordId, verdict: 'conflict', reason: 'reviewed' }], T);
    await addPhoto(db, USER_A, report, 'file:///cache/late.jpg', fakeFiles(), T);
    expect(await photoRows(db)).toHaveLength(1);
  });

  it('removes the kept copy when the save fails, so nothing is left half-written', async () => {
    const files = fakeFiles();
    const broken: DeviceDb = {
      ...db,
      transaction: async () => {
        throw new Error('disk full');
      },
    };
    await expect(addPhoto(broken, USER_A, report, 'file:///cache/x.jpg', files, T)).rejects.toThrow();
    expect(files.kept.size).toBe(0);
    expect(await photoRows(db)).toEqual([]);
  });

  describe('on a shared phone (ADR-020)', () => {
    it("never lists another user's photos, and refuses to add one to another user's report", async () => {
      await addPhoto(db, USER_A, report, 'file:///cache/a.jpg', fakeFiles(), T);

      expect(await listPhotos(db, USER_B, report.recordId)).toEqual([]);
      expect(await listPhotos(db, '', report.recordId)).toEqual([]);
      await expect(addPhoto(db, USER_B, report, 'file:///cache/b.jpg', fakeFiles(), T)).rejects.toMatchObject({
        code: 'report_not_saved',
      });
    });
  });

  it('keeps the photo record pending until the server answers', async () => {
    const photoId = await addPhoto(db, USER_A, report, 'file:///cache/x.jpg', fakeFiles(), T);
    expect(await getStatus(db, 'report_photos', photoId)).toEqual({ status: 'pending', reason: null });
  });
});

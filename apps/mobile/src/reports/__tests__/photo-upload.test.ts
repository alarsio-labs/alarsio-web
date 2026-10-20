import type { DeviceDb } from '../../db/device-db';
import { deviceMigrations } from '../../db/migrations';
import { prepareDeviceDb } from '../../db/prepare-device-db';
import { openTestDeviceDb } from '../../db/test-support/sqljs-device-db';
import { backoffMs, applyVerdicts, claimBatch } from '../../sync/outbox';
import { addPhoto, listPhotos, type PhotoFiles } from '../photo-store';
import { runPhotoUploads, type PhotoStorage, type UploadOutcome } from '../photo-upload';
import { saveReport, type StoredReport } from '../report-store';

// jest-expo stubs expo-crypto, so a counter stands in for randomUUID.
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `acacacac-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const USER_A = '11111111-0000-4000-8000-00000000000a';
const USER_B = '22222222-0000-4000-8000-00000000000b';
const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG };
const T = new Date('2026-10-20T12:30:00.000Z');
const FIELDS = { headcount: '12', workDone: 'Slab', blockers: '', seriousBlocker: false, safetyIncident: false, nextDayPlan: '' };

function fakeFiles(): PhotoFiles & { kept: Map<string, number>; removed: string[] } {
  const kept = new Map<string, number>();
  const removed: string[] = [];
  return {
    kept,
    removed,
    async keep(_s, photoId) {
      const uri = `file:///app/report-photos/${photoId}.jpg`;
      kept.set(uri, 1000);
      return { uri, sizeBytes: 1000 };
    },
    async read(uri) {
      if (!kept.has(uri)) throw new Error('file:///gone');
      return new Uint8Array(kept.get(uri)!);
    },
    async remove(uri) {
      kept.delete(uri);
      removed.push(uri);
    },
  };
}

interface Call {
  userId: string;
  path: string;
  contentType: string;
  size: number;
}
function fakeStorage(outcome: UploadOutcome | (() => UploadOutcome) | Error = 'uploaded'): PhotoStorage & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async upload(userId, path, bytes, contentType) {
      calls.push({ userId, path, contentType, size: bytes.length });
      if (outcome instanceof Error) throw outcome;
      return typeof outcome === 'function' ? outcome() : outcome;
    },
  };
}

describe('photo uploader (#81 PR 2)', () => {
  let db: DeviceDb;
  let files: ReturnType<typeof fakeFiles>;
  let report: StoredReport;
  let photoId: string;

  /** What the server answered for the photo's metadata. */
  const answer = async (verdict: 'accepted' | 'rejected' | 'conflict' | 'retryable_error', reason: string | null = null) => {
    await claimBatch(db, USER_A, T);
    await applyVerdicts(db, [{ entity: 'report_photos', record_id: photoId, verdict, reason }], T);
  };
  const state = async () => (await listPhotos(db, USER_A, report.recordId))[0]!;

  beforeEach(async () => {
    db = await openTestDeviceDb();
    await prepareDeviceDb(db, deviceMigrations);
    files = fakeFiles();
    const recordId = await saveReport(db, USER_A, SITE, '2026-10-20', FIELDS, 'draft', {}, T);
    report = {
      recordId,
      status: 'pending',
      reason: null,
      report: {
        orgId: ORG, siteId: SITE.id, reportDate: '2026-10-20', status: 'draft', headcount: 12, workDone: 'Slab',
        blockers: null, seriousBlocker: false, safetyIncident: false, nextDayPlan: null, editReason: null,
      },
    };
    photoId = await addPhoto(db, USER_A, report, 'file:///cache/p.jpg', files, T);
  });

  it('uploads nothing until the metadata is accepted (AC 3)', async () => {
    const storage = fakeStorage();
    await runPhotoUploads(db, USER_A, storage, files, T);
    expect(storage.calls).toEqual([]);

    await answer('retryable_error', 'missing_parent');
    await runPhotoUploads(db, USER_A, storage, files, T);
    expect(storage.calls).toEqual([]);

    await answer('rejected', 'invalid_input');
    await runPhotoUploads(db, USER_A, storage, files, T);
    expect(storage.calls).toEqual([]);
  });

  it('uploads the file once the metadata is accepted, under its path, then removes the local copy', async () => {
    await answer('accepted');
    const storage = fakeStorage();
    const result = await runPhotoUploads(db, USER_A, storage, files, T);

    expect(storage.calls).toEqual([
      { userId: USER_A, path: `${ORG}/${SITE.id}/${report.recordId}/${photoId}.jpg`, contentType: 'image/jpeg', size: 1000 },
    ]);
    expect(result).toEqual({ uploaded: 1, refused: 0, retry: 0 });
    expect((await state()).state).toBe('uploaded');
    expect(files.kept.size).toBe(0);
    expect(files.removed).toHaveLength(1);
  });

  it('uploads each photo once: a second run sends nothing', async () => {
    await answer('accepted');
    const storage = fakeStorage();
    await runPhotoUploads(db, USER_A, storage, files, T);
    await runPhotoUploads(db, USER_A, storage, files, T);
    expect(storage.calls).toHaveLength(1);
  });

  it('counts a file the bucket already holds as uploaded (a replay)', async () => {
    await answer('accepted');
    await runPhotoUploads(db, USER_A, fakeStorage('exists'), files, T);
    expect((await state()).state).toBe('uploaded');
    expect(files.kept.size).toBe(0);
  });

  it('marks a refusal terminal, keeps no retry, and keeps the local file for now', async () => {
    await answer('accepted');
    const storage = fakeStorage('refused');
    await runPhotoUploads(db, USER_A, storage, files, T);
    expect((await state()).state).toBe('refused');
    await runPhotoUploads(db, USER_A, storage, files, new Date(T.getTime() + 3_600_000));
    expect(storage.calls).toHaveLength(1);
  });

  it('retries a network failure after a backoff, then succeeds', async () => {
    await answer('accepted');
    const storage = fakeStorage('retry');
    expect(await runPhotoUploads(db, USER_A, storage, files, T)).toEqual({ uploaded: 0, refused: 0, retry: 1 });
    expect((await state()).state).toBe('waiting');

    // Not due yet.
    await runPhotoUploads(db, USER_A, storage, files, new Date(T.getTime() + backoffMs(1) - 1));
    expect(storage.calls).toHaveLength(1);

    const later = new Date(T.getTime() + backoffMs(1));
    await runPhotoUploads(db, USER_A, fakeStorage('uploaded'), files, later);
    expect((await state()).state).toBe('uploaded');
  });

  it('treats a thrown error as a retry and never lets it escape', async () => {
    await answer('accepted');
    await expect(runPhotoUploads(db, USER_A, fakeStorage(new Error('socket /data/user/0')), files, T)).resolves.toEqual({
      uploaded: 0, refused: 0, retry: 1,
    });
    expect((await state()).state).toBe('waiting');
  });

  it('refuses for good a photo whose local file is gone, instead of retrying forever', async () => {
    await answer('accepted');
    files.kept.clear();
    const storage = fakeStorage();
    await runPhotoUploads(db, USER_A, storage, files, T);
    expect(storage.calls).toEqual([]);
    expect((await state()).state).toBe('refused');
  });

  it("uploads only this user's photos, under this user's id (ADR-020)", async () => {
    await answer('accepted');
    const storage = fakeStorage();

    await runPhotoUploads(db, USER_B, storage, files, T);
    expect(storage.calls).toEqual([]);
    await runPhotoUploads(db, '', storage, files, T);
    expect(storage.calls).toEqual([]);

    await runPhotoUploads(db, USER_A, storage, files, T);
    expect(storage.calls.map((c) => c.userId)).toEqual([USER_A]);
  });

  it('goes on with the other photos when one fails', async () => {
    const second = await addPhoto(db, USER_A, report, 'file:///cache/q.jpg', files, new Date(T.getTime() + 1000));
    await claimBatch(db, USER_A, T);
    await applyVerdicts(db, [
      { entity: 'report_photos', record_id: photoId, verdict: 'accepted', reason: null },
      { entity: 'report_photos', record_id: second, verdict: 'accepted', reason: null },
    ], T);
    let n = 0;
    await runPhotoUploads(db, USER_A, fakeStorage(() => (n++ === 0 ? 'retry' : 'uploaded')), files, T);

    const photos = await listPhotos(db, USER_A, report.recordId);
    expect(photos.map((p) => p.state)).toEqual(['waiting', 'uploaded']);
  });
});

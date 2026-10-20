// Uploads the files of accepted report photos. Owner: Daily Reporting (Anuradha).
// Issue #81 PR 2, ADR-037. A file goes to the report-photos bucket only after its
// metadata row is on the server (the outbox record is `synced`): Storage takes a
// file only at the exact path of a metadata row its uploader made (ADR-013 R8).
// Runs for one user, so one user's photos never go out under another's session
// (ADR-020). It never throws: a failure is a state, kept for the next run.

import type { DeviceDb } from '../db/device-db';
import { backoffMs } from '../sync/outbox';
import type { PhotoFiles } from './photo-store';

export type UploadOutcome = 'uploaded' | 'exists' | 'refused' | 'retry';

/** The bucket, as the uploader needs it. The app's is Supabase Storage (photo-device.ts). */
export interface PhotoStorage {
  /** Puts the bytes at `path` under `userId`'s session, refusing if the session is anyone else's. */
  upload(userId: string, path: string, bytes: Uint8Array, contentType: string): Promise<UploadOutcome>;
}

export interface UploadRunResult {
  uploaded: number;
  refused: number;
  retry: number;
}

const BATCH = 20;

interface DueRow {
  record_id: string;
  local_uri: string;
  storage_path: string;
  content_type: string;
  attempts: number;
}

/**
 * Uploads this user's due photos, at most twenty a run, oldest first. A photo is
 * due when its metadata is `synced`, its file is still waiting, and its backoff
 * has passed. A user of '' has no photos.
 */
export async function runPhotoUploads(
  db: DeviceDb,
  userId: string,
  storage: PhotoStorage,
  files: PhotoFiles,
  now: Date = new Date(),
): Promise<UploadRunResult> {
  const result: UploadRunResult = { uploaded: 0, refused: 0, retry: 0 };
  if (!userId) return result;
  const author = userId.toLowerCase();

  const due = await db.all<DueRow>(
    `select f.record_id, f.local_uri, f.storage_path, f.content_type, f.attempts
       from report_photo_files f
       join outbox o on o.entity = 'report_photos' and o.record_id = f.record_id
      where f.author_id = ? and f.state = 'waiting' and o.status = 'synced'
        and (f.next_attempt_at is null or f.next_attempt_at <= ?)
      order by f.created_at, f.record_id
      limit ?`,
    [author, now.toISOString(), BATCH],
  );

  for (const row of due) {
    const outcome = await uploadOne(userId, row, storage, files);
    const at = now.toISOString();
    if (outcome === 'retry') {
      const attempts = row.attempts + 1;
      await db.run(
        `update report_photo_files set attempts = ?, next_attempt_at = ?, updated_at = ? where record_id = ?`,
        [attempts, new Date(now.getTime() + backoffMs(attempts)).toISOString(), at, row.record_id],
      );
      result.retry += 1;
      continue;
    }
    const state = outcome === 'refused' ? 'refused' : 'uploaded';
    await db.run(
      `update report_photo_files set state = ?, next_attempt_at = null, updated_at = ? where record_id = ?`,
      [state, at, row.record_id],
    );
    if (state === 'uploaded') {
      // The file is on the server: free the phone's copy. A failure to remove is not the photo's.
      await files.remove(row.local_uri).catch(() => undefined);
      result.uploaded += 1;
    } else {
      result.refused += 1;
    }
  }
  return result;
}

async function uploadOne(
  userId: string,
  row: DueRow,
  storage: PhotoStorage,
  files: PhotoFiles,
): Promise<'uploaded' | 'refused' | 'retry'> {
  let bytes: Uint8Array;
  try {
    bytes = await files.read(row.local_uri);
  } catch {
    // The file is gone from the phone: retrying cannot bring it back.
    return 'refused';
  }
  if (bytes.length === 0) return 'refused';
  try {
    const outcome = await storage.upload(userId, row.storage_path, bytes, row.content_type);
    return outcome === 'exists' ? 'uploaded' : outcome;
  } catch {
    // The message can name files and hosts; a thrown error is only ever a retry.
    return 'retry';
  }
}

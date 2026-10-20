// Adds a photo to a report on the phone and reads a report's photos back. Owner:
// Daily Reporting (Anuradha). Issue #81 PR 2, ADR-037. A photo is two things: its
// metadata, an outbox record of entity report_photos saved after its report (so
// the report is sent first), and its file, kept in the app's own folder and
// queued in report_photo_files until photo-upload.ts puts it in the bucket. A
// photo never blocks its report: nothing here touches the report's record.

import type { DeviceDb } from '../db/device-db';
import type { OutboxStatus } from '../sync/entities';
import { enqueue, getStatus, listRecords, newRecordId } from '../sync/outbox';
import {
  buildPhotoPayload,
  checkPhotoSize,
  PHOTO_CONTENT_TYPE,
  PHOTO_LIMITS,
  PhotoError,
  photoPath,
  type UploadState,
} from './photo';
import { parsePayload, type Report } from './report';
import type { StoredReport } from './report-store';

/** The phone's file system, as the photo flow needs it. The app's is expo-file-system (photo-device.ts). */
export interface PhotoFiles {
  /** Copies a picked, compressed image into the app's own folder under the photo id. */
  keep(sourceUri: string, photoId: string): Promise<{ uri: string; sizeBytes: number }>;
  read(uri: string): Promise<Uint8Array>;
  /** Removes a kept file. A file already gone is not an error. */
  remove(uri: string): Promise<void>;
}

export interface StoredPhoto {
  recordId: string;
  reportId: string;
  /** The metadata's outbox status, or null if its outbox row is missing. */
  outbox: OutboxStatus | null;
  reason: string | null;
  state: UploadState;
  createdAt: string;
}

/**
 * This user's saved report with that record id, as the phone holds it, or null. Only
 * then may a photo point at it, and its organisation and site come from here, never
 * from what the caller passed, so the path cannot name another report's place.
 */
async function ownReport(db: DeviceDb, userId: string, recordId: string): Promise<Report | null> {
  const records = await listRecords(db, userId, 'daily_reports', { limit: 400 });
  const found = records.find((r) => r.recordId === recordId.toLowerCase());
  return found ? parsePayload(found.payload) : null;
}

/**
 * Adds a photo to this user's saved report: keeps the file, queues it, and saves
 * its metadata to send. Anything refused throws a PhotoError and leaves nothing
 * behind. Returns the photo's record id.
 */
export async function addPhoto(
  db: DeviceDb,
  userId: string,
  report: StoredReport,
  sourceUri: string,
  files: PhotoFiles,
  now: Date = new Date(),
): Promise<string> {
  if (!userId) throw new PhotoError('not_found');
  const own = await ownReport(db, userId, report.recordId);
  if (!own) throw new PhotoError('report_not_saved');

  const reportId = report.recordId.toLowerCase();
  const [count] = await db.all<{ n: number }>(
    `select count(*) as n from report_photo_files where author_id = ? and report_id = ?`,
    [userId.toLowerCase(), reportId],
  );
  if ((count?.n ?? 0) >= PHOTO_LIMITS.perReport) throw new PhotoError('too_many');

  const photoId = newRecordId().toLowerCase();
  const kept = await files.keep(sourceUri, photoId);
  const storagePath = photoPath(own, reportId, photoId);
  const at = now.toISOString();
  let queued = false;
  try {
    checkPhotoSize(kept.sizeBytes);
    // Two steps, not one transaction: enqueue opens its own, and they do not nest.
    // The file row first, so a photo whose metadata is saved always has its file.
    await db.transaction(async () => {
      await db.run(
        `insert into report_photo_files
           (record_id, author_id, report_id, local_uri, storage_path, content_type, size_bytes, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [photoId, userId.toLowerCase(), reportId, kept.uri, storagePath, PHOTO_CONTENT_TYPE, kept.sizeBytes, at, at],
      );
    });
    queued = true;
    await enqueue(
      db,
      {
        entity: 'report_photos',
        recordId: photoId,
        authorId: userId,
        payload: buildPhotoPayload({ reportId, storagePath, sizeBytes: kept.sizeBytes }),
      },
      now,
    );
  } catch (error) {
    if (queued) {
      await db.run(`delete from report_photo_files where record_id = ?`, [photoId]).catch(() => undefined);
    }
    await files.remove(kept.uri).catch(() => undefined);
    throw error;
  }
  return photoId;
}

/** This user's photos of one report, oldest first, with where each stands. */
export async function listPhotos(db: DeviceDb, userId: string, reportId: string): Promise<StoredPhoto[]> {
  // Without a user there is nothing: never another user's photos (ADR-020).
  if (!userId) return [];
  const rows = await db.all<{ record_id: string; report_id: string; state: UploadState; created_at: string }>(
    `select record_id, report_id, state, created_at from report_photo_files
      where author_id = ? and report_id = ?
      order by created_at, record_id`,
    [userId.toLowerCase(), reportId.toLowerCase()],
  );
  const photos: StoredPhoto[] = [];
  for (const r of rows) {
    const status = await getStatus(db, 'report_photos', r.record_id);
    photos.push({
      recordId: r.record_id,
      reportId: r.report_id,
      outbox: status?.status ?? null,
      reason: status?.reason ?? null,
      state: r.state,
      createdAt: r.created_at,
    });
  }
  return photos;
}

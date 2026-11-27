// A report photo as the phone names, checks and describes it. Owner: Daily
// Reporting (Anuradha). Issue #81 PR 2, ADR-037. The metadata goes through the
// outbox to sync_report_photos (ADR-022 H7); the file goes to the private
// report-photos bucket only after that row exists (ADR-013 R8). The database and
// the bucket are the boundary: these checks only say what is wrong sooner.

import i18n from '../i18n';
import type { OutboxStatus } from '../sync/entities';
import { reasonText } from '../sync/status-text';

const t = i18n.t.bind(i18n);

/** ADR-013 R4: ten photos a report, 10 MB each (the table's CHECK and the bucket's limit). */
export const PHOTO_LIMITS = {
  perReport: 10,
  maxBytes: 10_485_760,
} as const;

/** The phone compresses every photo to a JPEG (P1), so this is the only type it sends. */
export const PHOTO_CONTENT_TYPE = 'image/jpeg';

export type PhotoErrorCode = 'report_not_saved' | 'too_many' | 'too_large' | 'empty_file' | 'not_found';

export class PhotoError extends Error {
  constructor(readonly code: PhotoErrorCode) {
    super(code);
    this.name = 'PhotoError';
  }
}

/** Where the file lives in the bucket: the path report_photos_path_shape requires. */
export function photoPath(report: { orgId: string; siteId: string }, reportId: string, photoId: string): string {
  return `${report.orgId}/${report.siteId}/${reportId}/${photoId}.jpg`.toLowerCase();
}

export function checkPhotoSize(sizeBytes: number): void {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) throw new PhotoError('empty_file');
  if (sizeBytes > PHOTO_LIMITS.maxBytes) throw new PhotoError('too_large');
}

export interface PhotoMeta {
  reportId: string;
  storagePath: string;
  sizeBytes: number;
}

/** The payload sync_report_photos reads. No caption field yet (P6), so it is always null. */
export function buildPhotoPayload(p: PhotoMeta): Record<string, unknown> {
  return {
    report_id: p.reportId.toLowerCase(),
    storage_path: p.storagePath,
    size_bytes: p.sizeBytes,
    content_type: PHOTO_CONTENT_TYPE,
    caption: null,
  };
}

export function parsePhotoPayload(p: unknown): PhotoMeta | null {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const v = p as Record<string, unknown>;
  if (typeof v.report_id !== 'string' || typeof v.storage_path !== 'string') return null;
  if (typeof v.size_bytes !== 'number' || !Number.isInteger(v.size_bytes)) return null;
  return { reportId: v.report_id, storagePath: v.storage_path, sizeBytes: v.size_bytes };
}

/** Where the file stands on the phone: waiting to upload, uploaded, or refused for good. */
export type UploadState = 'waiting' | 'uploaded' | 'refused';

export type PhotoTone = 'wait' | 'ok' | 'attention';

// The handler's answers (ADR-022 H7) and sync_push's mapping, said for a photo.
const PHOTO_REASONS = {
  permission_denied: 'dailyReport.photo.reason.permission_denied',
  invalid_input: 'dailyReport.photo.reason.invalid_input',
  duplicate: 'dailyReport.photo.reason.duplicate',
} as const;

const isPhotoReason = (reason: string): reason is keyof typeof PHOTO_REASONS => reason in PHOTO_REASONS;

/**
 * Where a photo stands, from its metadata's outbox status and its file's upload
 * state. "On the server" only once the file itself is there.
 */
export function photoStatusText(
  outbox: OutboxStatus,
  reason: string | null,
  upload: UploadState,
): { tone: PhotoTone; text: string } {
  if (upload === 'refused') return { tone: 'attention', text: t('dailyReport.photo.status.refused') };
  switch (outbox) {
    case 'pending':
    case 'syncing':
      return { tone: 'wait', text: t('dailyReport.photo.status.waiting') };
    case 'failed':
      return reason === 'missing_parent'
        ? { tone: 'wait', text: t('dailyReport.photo.status.waitingForReport') }
        : { tone: 'wait', text: t('dailyReport.photo.status.failed') };
    case 'synced':
      return upload === 'uploaded'
        ? { tone: 'ok', text: t('dailyReport.photo.status.onServer') }
        : { tone: 'wait', text: t('dailyReport.photo.status.waitingUpload') };
    case 'conflict':
    case 'rejected': {
      const why = reason !== null && isPhotoReason(reason) ? t(PHOTO_REASONS[reason]) : reasonText(reason);
      return { tone: 'attention', text: t('dailyReport.photo.status.attention', { reason: why }) };
    }
  }
}

/** One fixed sentence per failure, never the error's own text (it can name files, ADR-029). */
export function photoErrorText(error: unknown): string {
  if (error instanceof PhotoError) return t(`dailyReport.photo.error.${error.code}`, { max: PHOTO_LIMITS.perReport });
  return t('dailyReport.photo.error.generic');
}

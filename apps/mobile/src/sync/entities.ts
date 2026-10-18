// The field entities the phone may sync, and the shapes sync_push answers with.
// Owner: Offline Sync (Nikhil). Must match the list in sync_push (#33, ADR-014).

export const SYNC_ENTITIES = [
  'site_visits',
  'attendance_days',
  'attendance_entries',
  'attendance_corrections',
  'daily_reports',
  'report_photos',
  'material_transactions',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export function isSyncEntity(value: string): value is SyncEntity {
  return (SYNC_ENTITIES as readonly string[]).includes(value);
}

/** The four answers sync_push gives per record (ADR-009). */
export type SyncVerdict = 'accepted' | 'conflict' | 'rejected' | 'retryable_error';

/** One element of sync_push's `results`, as the server sends it. */
export interface SyncResultRow {
  entity: string;
  record_id: string;
  verdict: SyncVerdict;
  reason: string | null;
}

/** What the phone shows for a record (ADR-009). "Submitted" means synced only. */
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'rejected';

export const OUTBOX_STATUSES: readonly OutboxStatus[] = [
  'pending',
  'syncing',
  'synced',
  'failed',
  'conflict',
  'rejected',
];

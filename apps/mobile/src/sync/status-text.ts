// What the phone says about sync, in one place. Owner: Offline Sync (Nikhil).
// Issue #68. "Submitted" is never claimed here: only a synced record is on the
// server, and the screens that capture a record say so for that record (ADR-009).

import type { SyncStatus } from './engine';
import type { SyncEntity } from './entities';
import type { MirrorSummary, PullResult } from './pull';

const ENTITY_LABELS: Record<SyncEntity, string> = {
  site_visits: 'Site visit',
  attendance_days: 'Attendance day',
  attendance_entries: 'Attendance entry',
  attendance_corrections: 'Attendance correction',
  daily_reports: 'Daily report',
  report_photos: 'Report photo',
  material_transactions: 'Material entry',
};

export function entityLabel(entity: SyncEntity): string {
  return ENTITY_LABELS[entity];
}

const APP_BUG = 'The app sent this wrongly. Please report it.';
const DIFFERENT_VERSION = 'The server already has a different version.';

// Codes from sync_push (#33) and the module handlers (ADR-017, ADR-022).
const REASONS: Record<string, string> = {
  permission_denied: "You can't record on this site any more.",
  invalid_input: "Something in this record isn't valid.",
  invalid_state: 'The site or record is closed.',
  invalid_record_id: APP_BUG,
  unknown_entity: APP_BUG,
  invalid_payload: APP_BUG,
  duplicate: DIFFERENT_VERSION,
  different_report: DIFFERENT_VERSION,
  reviewed: 'A manager already reviewed it.',
};

/** Why the server refused or kept its own version of a record, in plain words. */
export function reasonText(reason: string | null): string {
  if (reason === null) return 'Refused';
  return REASONS[reason] ?? `Refused (${reason})`;
}

/** One line about this user's outbox and the last run. */
export function syncLine(status: SyncStatus): string {
  const { counts, last, running, userId } = status;
  const waiting = counts.pending + counts.syncing + counts.failed;
  const attention = counts.conflict + counts.rejected;

  const parts: string[] = [];
  if (running) parts.push(`Sending… ${waiting} waiting`);
  else if (waiting > 0) parts.push(`${waiting} waiting to send`);
  else if (attention === 0) parts.push(userId ? 'All your records are on the server' : 'Nothing waiting to send');
  if (attention > 0) parts.push(`${attention} need attention`);

  const note = lastRunNote(last, userId);
  if (note) parts.push(note);
  return parts.join(' · ');
}

/** How old a timestamp is, in plain words. A clock that moved back reads as just now. */
function ageText(timestamp: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(timestamp)) / 60_000);
  if (!(minutes >= 1)) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * What the phone holds for offline use, how old it is, and whether the last
 * refresh failed (#49). The copy stays on screen after a failed refresh, which
 * is every refresh made offline. The failure reason is never printed: it can name
 * files or data.
 */
export function pullLine(mirror: MirrorSummary | null, lastPull: PullResult | null, now: Date): string | null {
  const failed = lastPull?.kind === 'failed';
  if (mirror === null) return failed ? 'Offline copy not available yet. Will retry.' : null;
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const parts = [
    `On this phone: ${n(mirror.sites, 'site', 'sites')}, ${n(mirror.materials, 'material', 'materials')}, ${n(mirror.roster, 'worker', 'workers')}`,
    `updated ${ageText(mirror.refreshedAt, now)}`,
  ];
  if (failed) parts.push('refresh failed, will retry');
  return parts.join(' · ');
}

function lastRunNote(last: SyncStatus['last'], userId: string | null): string | null {
  if (last?.kind === 'signed_out') {
    // Signed in on the phone, but the session could not be refreshed: offline
    // with an expired token (#56). Signing in again would not help.
    return userId ? 'Waiting for connection' : 'Sign in to sync';
  }
  if (last?.kind !== 'failed') return null;
  if (last.reason === 'network') return 'No connection. Will retry.';
  if (last.reason === 'server:PT429') return 'Server busy. Will retry.';
  // Another user signed in mid-run; their run follows, and nothing was lost.
  if (last.reason === 'session_changed') return null;
  return `Last try failed (${last.reason})`;
}

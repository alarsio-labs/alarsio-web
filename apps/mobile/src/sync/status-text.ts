// What the phone says about sync, in one place. Owner: Offline Sync (Nikhil).
// Issue #68. "Submitted" is never claimed here: only a synced record is on the
// server, and the screens that capture a record say so for that record (ADR-009).
// The words are in src/i18n (en.json, hi.json) under "sync".

import i18n from '../i18n';
import type { SyncStatus } from './engine';
import type { SyncEntity } from './entities';
import type { MirrorSummary, PullResult } from './pull';

const t = i18n.t.bind(i18n);

const ENTITY_LABELS = {
  site_visits: 'sync.entity.site_visits',
  attendance_days: 'sync.entity.attendance_days',
  attendance_entries: 'sync.entity.attendance_entries',
  attendance_corrections: 'sync.entity.attendance_corrections',
  daily_reports: 'sync.entity.daily_reports',
  report_photos: 'sync.entity.report_photos',
  material_transactions: 'sync.entity.material_transactions',
  worker_advances: 'sync.entity.worker_advances',
} as const satisfies Record<SyncEntity, string>;

export function entityLabel(entity: SyncEntity): string {
  return t(ENTITY_LABELS[entity]);
}

const APP_BUG = 'sync.reason.appBug';
const DIFFERENT_VERSION = 'sync.reason.differentVersion';

// Codes from sync_push (#33) and the module handlers (ADR-017, ADR-022).
const REASONS = {
  permission_denied: 'sync.reason.permission_denied',
  invalid_input: 'sync.reason.invalid_input',
  invalid_state: 'sync.reason.invalid_state',
  invalid_record_id: APP_BUG,
  unknown_entity: APP_BUG,
  invalid_payload: APP_BUG,
  duplicate: DIFFERENT_VERSION,
  different_report: DIFFERENT_VERSION,
  reviewed: 'sync.reason.reviewed',
  sent_back: 'sync.reason.sent_back',
  locked: 'sync.reason.locked',
} as const;

const isKnownReason = (reason: string): reason is keyof typeof REASONS => reason in REASONS;

/** Why the server refused or kept its own version of a record, in plain words. */
export function reasonText(reason: string | null): string {
  if (reason === null) return t('sync.reason.refused');
  return isKnownReason(reason) ? t(REASONS[reason]) : t('sync.reason.refusedCode', { reason });
}

/**
 * One line about this user's outbox and the last run. It says "all on the
 * server" only about counts it has read, and never prints raw error text.
 */
export function syncLine(status: SyncStatus): string {
  const { counts, last, running, userId, loaded, readFailed } = status;
  const waiting = counts.pending + counts.syncing + counts.failed;
  const attention = counts.conflict + counts.rejected;

  const parts: string[] = [];
  if (readFailed) parts.push(t('sync.line.readFailed'));
  else if (!loaded) parts.push(t('sync.checking'));
  else if (running) parts.push(t('sync.sending', { waiting }));
  else if (waiting > 0) parts.push(t('sync.waiting', { count: waiting }));
  else if (attention === 0) parts.push(userId ? t('sync.line.allOnServer') : t('sync.line.nothingWaiting'));
  if (loaded && !readFailed && attention > 0) parts.push(t('sync.needAttention', { count: attention }));

  const note = lastRunNote(last, userId, loaded && !readFailed && waiting > 0);
  if (note) parts.push(note);
  return parts.join(' · ');
}

// A server code such as server:PT429 or server:28000: short, letters and digits only.
const SAFE_SERVER_REASON = /^server:[A-Za-z0-9]{1,8}$/;

/** How old a timestamp is, in plain words. A clock that moved back reads as just now. */
export function ageText(timestamp: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(timestamp)) / 60_000);
  if (!(minutes >= 1)) return t('sync.age.justNow');
  if (minutes < 60) return t('sync.age.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('sync.age.hours', { count: hours });
  return t('sync.age.days', { count: Math.floor(hours / 24) });
}

/**
 * What the phone holds for offline use, how old it is, and whether the last
 * refresh failed (#49). The copy stays on screen after a failed refresh, which
 * is every refresh made offline. The failure reason is never printed: it can name
 * files or data.
 */
export function pullLine(mirror: MirrorSummary | null, lastPull: PullResult | null, now: Date): string | null {
  const failed = lastPull?.kind === 'failed';
  if (mirror === null) return failed ? t('sync.pull.notAvailable') : null;
  const parts = [
    t('sync.pull.onPhone', {
      sites: t('sync.pull.sites', { count: mirror.sites }),
      materials: t('sync.pull.materials', { count: mirror.materials }),
      workers: t('sync.pull.workers', { count: mirror.roster }),
    }),
    t('sync.pull.updated', { age: ageText(mirror.refreshedAt, now) }),
  ];
  if (failed) parts.push(t('sync.pull.refreshFailed'));
  return parts.join(' · ');
}

function lastRunNote(last: SyncStatus['last'], userId: string | null, waiting: boolean): string | null {
  if (last?.kind === 'signed_out') {
    // Signed in on the phone, but the session could not be refreshed: offline
    // with an expired token (#56). Signing in again would not help. It only
    // matters when something is waiting.
    if (!userId) return t('sync.note.signIn');
    return waiting ? t('sync.note.waitingConnection') : null;
  }
  if (last?.kind !== 'failed') return null;
  const reason = last.reason;
  if (reason === 'network') return t('sync.note.network');
  if (reason === 'server:PT429') return t('sync.note.serverBusy');
  // Another user signed in mid-run; their run follows, and nothing was lost.
  if (reason === 'session_changed') return null;
  if (reason === 'local_error') return t('sync.note.localError');
  if (reason.startsWith('invalid_envelope')) return t('sync.note.disagree');
  if (reason === 'bad_response') return t('sync.note.badResponse');
  // Only a short server code is echoed; anything else could carry file names or data.
  if (SAFE_SERVER_REASON.test(reason)) return t('sync.note.lastFailedCode', { reason });
  return t('sync.note.lastFailed');
}

export type SyncChipTone = 'ok' | 'wait' | 'attention';

/**
 * The short chip on Today: one tone and a few words, always visible. Like syncLine it
 * says "All sent" only about counts it has read; a record that needs attention wins.
 */
export function syncChip(status: SyncStatus): { tone: SyncChipTone; text: string } {
  const { counts, running, loaded, readFailed } = status;
  const waiting = counts.pending + counts.syncing + counts.failed;
  const attention = counts.conflict + counts.rejected;
  if (readFailed) return { tone: 'attention', text: t('sync.chip.cannotRead') };
  if (attention > 0) return { tone: 'attention', text: t('sync.needAttention', { count: attention }) };
  if (!loaded) return { tone: 'wait', text: t('sync.checking') };
  if (running) return { tone: 'wait', text: t('sync.sending', { waiting }) };
  if (waiting > 0) return { tone: 'wait', text: t('sync.waiting', { count: waiting }) };
  return { tone: 'ok', text: t('sync.chip.allSent') };
}

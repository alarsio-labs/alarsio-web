import type { SyncStatus } from '../engine';
import { SYNC_ENTITIES } from '../entities';
import { entityLabel, pullLine, reasonText, syncLine } from '../status-text';

const USER = '11111111-0000-4000-8000-00000000000a';
const zero = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 };
const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  counts: zero,
  attention: [],
  lastPull: null,
  last: null,
  running: false,
  userId: USER,
  ...over,
});
const failed = (reason: string) => ({ kind: 'failed' as const, reason, batches: 0, records: 0 });

describe('syncLine (#68)', () => {
  it('counts pending, syncing and failed as waiting', () => {
    expect(syncLine(status({ counts: { ...zero, pending: 1, syncing: 2, failed: 3, synced: 9 } }))).toBe(
      '6 waiting to send',
    );
  });

  it('says everything is on the server only when nothing waits and nothing needs attention', () => {
    expect(syncLine(status({ counts: { ...zero, synced: 4 } }))).toBe('All your records are on the server');
    expect(syncLine(status({ userId: null }))).toBe('Nothing waiting to send');
    expect(syncLine(status({ counts: { ...zero, rejected: 1 } }))).toBe('1 need attention');
  });

  it('says when sending, and how many need attention', () => {
    expect(syncLine(status({ running: true, counts: { ...zero, pending: 2, conflict: 1, rejected: 1 } }))).toBe(
      'Sending… 2 waiting · 2 need attention',
    );
  });

  it('asks to sign in only when no one is signed in on the phone', () => {
    expect(syncLine(status({ userId: null, last: { kind: 'signed_out' } }))).toBe(
      'Nothing waiting to send · Sign in to sync',
    );
  });

  it('says waiting for connection when signed in on the phone but the session cannot refresh offline', () => {
    expect(syncLine(status({ last: { kind: 'signed_out' } }))).toBe(
      'All your records are on the server · Waiting for connection',
    );
  });

  it('turns run failures into plain words, and hides a session change', () => {
    const waiting = { counts: { ...zero, pending: 1 } };
    expect(syncLine(status({ ...waiting, last: failed('network') }))).toBe('1 waiting to send · No connection. Will retry.');
    expect(syncLine(status({ ...waiting, last: failed('server:PT429') }))).toBe(
      '1 waiting to send · Server busy. Will retry.',
    );
    expect(syncLine(status({ ...waiting, last: failed('session_changed') }))).toBe('1 waiting to send');
    expect(syncLine(status({ ...waiting, last: failed('server:28000') }))).toBe(
      '1 waiting to send · Last try failed (server:28000)',
    );
  });

  it('never says submitted, whatever the state', () => {
    const lasts = [null, { kind: 'signed_out' as const }, failed('network'), { kind: 'done' as const, batches: 1, records: 3 }];
    for (const last of lasts) {
      for (const running of [true, false]) {
        for (const counts of [zero, { ...zero, synced: 5 }, { ...zero, pending: 1, rejected: 1 }]) {
          for (const userId of [USER, null]) {
            expect(syncLine(status({ last, running, counts, userId })).toLowerCase()).not.toContain('submitted');
          }
        }
      }
    }
  });
});

describe('pullLine (#49)', () => {
  it('says what the phone holds, or why it was not refreshed', () => {
    expect(pullLine(null)).toBeNull();
    expect(pullLine({ kind: 'signed_out' })).toBeNull();
    expect(pullLine({ kind: 'done', sites: 1, materials: 14, roster: 1 })).toBe(
      'On this phone: 1 site, 14 materials, 1 worker',
    );
    expect(pullLine({ kind: 'failed', reason: 'network' })).toBe('Offline copy not refreshed (network)');
  });
});

describe('labels', () => {
  it('names every sync entity in plain words', () => {
    for (const entity of SYNC_ENTITIES) expect(entityLabel(entity)).not.toBe(entity);
    expect(entityLabel('material_transactions')).toBe('Material entry');
    expect(entityLabel('daily_reports')).toBe('Daily report');
  });

  it('explains the reason codes sync_push and the handlers send', () => {
    expect(reasonText('permission_denied')).toBe("You can't record on this site any more.");
    expect(reasonText('invalid_input')).toBe("Something in this record isn't valid.");
    expect(reasonText('invalid_state')).toBe('The site or record is closed.');
    for (const code of ['invalid_record_id', 'unknown_entity', 'invalid_payload']) {
      expect(reasonText(code)).toBe('The app sent this wrongly. Please report it.');
    }
    expect(reasonText('duplicate')).toBe('The server already has a different version.');
    expect(reasonText('different_report')).toBe('The server already has a different version.');
    expect(reasonText('reviewed')).toBe('A manager already reviewed it.');
  });

  it('shows an unknown code as it is, and a missing one as refused', () => {
    expect(reasonText('something_new')).toBe('Refused (something_new)');
    expect(reasonText(null)).toBe('Refused');
  });
});

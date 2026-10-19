import type { SyncStatus } from '../engine';
import { SYNC_ENTITIES } from '../entities';
import { entityLabel, pullLine, reasonText, syncLine } from '../status-text';

const USER = '11111111-0000-4000-8000-00000000000a';
const zero = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 };
const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  counts: zero,
  attention: [],
  loaded: true,
  readFailed: false,
  lastPull: null,
  mirror: null,
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

  it('says waiting for connection only when something is waiting and the session cannot refresh offline', () => {
    expect(syncLine(status({ counts: { ...zero, pending: 2 }, last: { kind: 'signed_out' } }))).toBe(
      '2 waiting to send · Waiting for connection',
    );
    expect(syncLine(status({ last: { kind: 'signed_out' } }))).toBe('All your records are on the server');
  });

  it('claims nothing about the server until the counts have been read', () => {
    expect(syncLine(status({ loaded: false }))).toBe('Checking…');
    expect(syncLine(status({ loaded: false, readFailed: true }))).toBe('Could not read your records on this phone.');
    // A later failed read: the old counts may be stale, so no claim either.
    expect(syncLine(status({ loaded: true, readFailed: true, counts: { ...zero, synced: 3 } }))).toBe(
      'Could not read your records on this phone.',
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

  it('never prints raw error text: internal failures get one fixed sentence each', () => {
    const waiting = { counts: { ...zero, pending: 1 } };
    const line = (reason: string) => syncLine(status({ ...waiting, last: failed(reason) }));
    expect(line('local_error')).toBe('1 waiting to send · Something went wrong on this phone. Will retry.');
    expect(line('invalid_envelope:version must be 1')).toBe(
      '1 waiting to send · The app and the server disagree. Please update the app.',
    );
    expect(line('bad_response')).toBe("1 waiting to send · The server's answer wasn't understood. Will retry.");

    const leaks = [
      `local:SQLITE_FULL: ${'x'.repeat(300)} /data/user/0/com.alarsio/databases/alarsio.db`,
      'server:' + 'y'.repeat(200),
      'server:PGRST 301 jwt expired for user a@b.com',
      '/data/user/0/com.alarsio/files',
    ];
    for (const reason of leaks) {
      const text = line(reason);
      expect(text).toBe('1 waiting to send · Last try failed. Will retry.');
      expect(text).not.toMatch(/\/|SQLITE|@|xxxx|yyyy/);
    }
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
  const NOW = new Date('2026-10-20T12:00:00.000Z');
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const mirror = (refreshedAt: string) => ({ refreshedAt, sites: 1, materials: 14, roster: 1 });
  const MIN = 60_000;

  it('says nothing before the phone holds a copy or has tried one', () => {
    expect(pullLine(null, null, NOW)).toBeNull();
    expect(pullLine(null, { kind: 'signed_out' }, NOW)).toBeNull();
  });

  it('says what the phone holds and how old it is', () => {
    expect(pullLine(mirror(ago(10_000)), { kind: 'done', sites: 1, materials: 14, roster: 1 }, NOW)).toBe(
      'On this phone: 1 site, 14 materials, 1 worker · updated just now',
    );
    expect(pullLine(mirror(ago(5 * MIN)), null, NOW)).toBe('On this phone: 1 site, 14 materials, 1 worker · updated 5 min ago');
    expect(pullLine(mirror(ago(2 * 60 * MIN)), null, NOW)).toBe('On this phone: 1 site, 14 materials, 1 worker · updated 2 h ago');
    expect(pullLine(mirror(ago(3 * 24 * 60 * MIN)), null, NOW)).toBe('On this phone: 1 site, 14 materials, 1 worker · updated 3 days ago');
    // A clock that moved back is not "in the future".
    expect(pullLine(mirror(ago(-5 * MIN)), null, NOW)).toBe('On this phone: 1 site, 14 materials, 1 worker · updated just now');
  });

  it('still shows the copy it holds when the last refresh failed, and says so', () => {
    expect(pullLine(mirror(ago(2 * 60 * MIN)), { kind: 'failed', reason: 'network' }, NOW)).toBe(
      'On this phone: 1 site, 14 materials, 1 worker · updated 2 h ago · refresh failed, will retry',
    );
  });

  it('says there is no copy yet when the first refresh failed', () => {
    expect(pullLine(null, { kind: 'failed', reason: 'network' }, NOW)).toBe('Offline copy not available yet. Will retry.');
  });

  it('never prints the failure reason, whatever it holds', () => {
    const reason = 'UNIQUE constraint failed: /data/user/0/com.alarsio/databases/alarsio.db a@b.com';
    for (const m of [null, mirror(ago(MIN))]) {
      expect(pullLine(m, { kind: 'failed', reason }, NOW)).not.toMatch(/UNIQUE|\/|@/);
    }
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
    // PS409: a lock refused a stale write to an approved record (sync_push, #28).
    expect(reasonText('locked')).toBe('A manager already approved this day, so it was not changed.');
  });

  it('shows an unknown code as it is, and a missing one as refused', () => {
    expect(reasonText('something_new')).toBe('Refused (something_new)');
    expect(reasonText(null)).toBe('Refused');
  });
});

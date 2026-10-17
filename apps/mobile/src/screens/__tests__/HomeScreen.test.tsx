import { render, screen } from '@testing-library/react-native';

import type { PublicConfigResult } from '../../config/public-config';
import type { DeviceDb } from '../../db/device-db';
import type { SyncHandle, SyncStatus } from '../../sync/engine';
import { HomeScreen, syncLine } from '../HomeScreen';

const goodConfig: PublicConfigResult = {
  ok: true,
  config: { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_abc' },
};

// The screen only passes the database on to startSync, so an empty object will do.
const fakeDb = {} as DeviceDb;
const openFakeDb = () => Promise.resolve(fakeDb);

const zero = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 };
const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({ counts: zero, last: null, running: false, ...over });

describe('HomeScreen', () => {
  it('shows the database as ready once it opens', async () => {
    await render(<HomeScreen openDb={openFakeDb} config={goodConfig} appVersion="0.1.0" />);

    expect(await screen.findByText('Device database ready')).toBeTruthy();
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();
    expect(screen.queryByText(/Configuration missing/)).toBeNull();
    expect(screen.queryByText(/^Sync:/)).toBeNull();
  });

  it('shows why the database failed instead of crashing', async () => {
    await render(
      <HomeScreen
        openDb={() => Promise.reject(new Error('disk full'))}
        config={goodConfig}
        appVersion="0.1.0"
      />,
    );

    expect(await screen.findByText('Device database failed: disk full')).toBeTruthy();
  });

  it('names the missing settings', async () => {
    await render(
      <HomeScreen
        openDb={openFakeDb}
        config={{ ok: false, missing: ['EXPO_PUBLIC_SUPABASE_URL'] }}
        appVersion="0.1.0"
      />,
    );

    expect(
      await screen.findByText('Configuration missing: EXPO_PUBLIC_SUPABASE_URL'),
    ).toBeTruthy();
    expect(await screen.findByText('Device database ready')).toBeTruthy();
  });

  it('starts sync with the opened database and shows its status', async () => {
    const startSync = jest.fn(
      (db: DeviceDb): SyncHandle => {
        expect(db).toBe(fakeDb);
        return {
          requestSync: jest.fn(),
          syncNow: jest.fn(),
          getStatus: () => status({ counts: { ...zero, pending: 3 } }),
          subscribe: () => () => undefined,
          stop: jest.fn(),
        };
      },
    );

    await render(
      <HomeScreen openDb={openFakeDb} startSync={startSync} config={goodConfig} appVersion="0.1.0" />,
    );

    expect(await screen.findByText('Sync: 3 waiting')).toBeTruthy();
    expect(startSync).toHaveBeenCalledTimes(1);
  });
});

describe('syncLine', () => {
  it('counts pending, syncing and failed as waiting', () => {
    expect(syncLine(status({ counts: { ...zero, pending: 1, syncing: 2, failed: 3, synced: 9 } }))).toBe(
      'Sync: 6 waiting',
    );
  });

  it('says when records need attention, and when sending', () => {
    expect(syncLine(status({ running: true, counts: { ...zero, conflict: 1, rejected: 1 } }))).toBe(
      'Sync: sending… 0 waiting · 2 need attention',
    );
  });

  it('asks the user to sign in, or names why the last try failed', () => {
    expect(syncLine(status({ last: { kind: 'signed_out' } }))).toBe('Sync: 0 waiting · sign in to sync');
    expect(
      syncLine(status({ last: { kind: 'failed', reason: 'network', batches: 0, records: 0 } })),
    ).toBe('Sync: 0 waiting · last try failed (network)');
  });
});

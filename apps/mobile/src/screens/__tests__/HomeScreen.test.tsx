import { fireEvent, render, screen } from '@testing-library/react-native';

import type { PublicConfigResult } from '../../config/public-config';
import type { DeviceDb } from '../../db/device-db';
import type { SyncHandle, SyncStatus } from '../../sync/engine';
import { HomeScreen } from '../HomeScreen';

const goodConfig: PublicConfigResult = {
  ok: true,
  config: { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_abc' },
};

// The screen only passes the database on to startSync, so an empty object will do.
const fakeDb = {} as DeviceDb;
const openFakeDb = () => Promise.resolve(fakeDb);

const zero = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 };
const USER = '11111111-0000-4000-8000-00000000000a';
const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  counts: zero,
  attention: [],
  lastPull: null,
  last: null,
  running: false,
  userId: USER,
  ...over,
});

function fakeHandle(over: Partial<SyncHandle> = {}): SyncHandle {
  return {
    requestSync: jest.fn(),
    syncNow: jest.fn(),
    retryNow: jest.fn(),
    getStatus: () => status({ counts: { ...zero, pending: 3 } }),
    subscribe: () => () => undefined,
    stop: jest.fn(),
    ...over,
  };
}

describe('HomeScreen', () => {
  it('shows the database as ready once it opens', async () => {
    await render(<HomeScreen openDb={openFakeDb} config={goodConfig} appVersion="0.1.0" />);

    expect(await screen.findByText('Device database ready')).toBeTruthy();
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();
    expect(screen.queryByText(/Configuration missing/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
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

  it('starts sync for the signed-in user with the opened database and shows its status', async () => {
    const startSync = jest.fn((db: DeviceDb, userId?: string): SyncHandle => {
      expect(db).toBe(fakeDb);
      expect(userId).toBe(USER);
      return fakeHandle();
    });

    await render(
      <HomeScreen openDb={openFakeDb} startSync={startSync} userId={USER} config={goodConfig} appVersion="0.1.0" />,
    );

    expect(await screen.findByText('3 waiting to send')).toBeTruthy();
    expect(startSync).toHaveBeenCalledTimes(1);
  });

  it('Sync now retries through the handle', async () => {
    const retryNow = jest.fn();
    await render(
      <HomeScreen
        openDb={openFakeDb}
        startSync={() => fakeHandle({ retryNow })}
        config={goodConfig}
        appVersion="0.1.0"
      />,
    );

    await fireEvent.press(await screen.findByRole('button', { name: 'Sync now' }));
    expect(retryNow).toHaveBeenCalledTimes(1);
  });
});

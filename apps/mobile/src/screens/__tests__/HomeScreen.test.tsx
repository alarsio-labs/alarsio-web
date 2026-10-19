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
  loaded: true,
  readFailed: false,
  last: null,
  running: false,
  userId: USER,
  ...over,
});

function fakeHandle(over: Partial<SyncHandle> = {}): SyncHandle {
  return {
    requestSync: jest.fn(),
    syncNow: jest.fn(),
    retryNow: jest.fn(() => Promise.resolve({ kind: 'done' as const, batches: 0, records: 0 })),
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

  it('starts no sync and shows no sync panel when no user is given, instead of showing every user', async () => {
    const startSync = jest.fn(() => fakeHandle());

    await render(<HomeScreen openDb={openFakeDb} startSync={startSync} config={goodConfig} appVersion="0.1.0" />);

    expect(await screen.findByText('Device database ready')).toBeTruthy();
    expect(startSync).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
    expect(screen.queryByText(/waiting to send|need attention/)).toBeNull();
  });

  it("drops the previous user's panel as soon as the user changes", async () => {
    let opens = 0;
    // The first open resolves; the second never does, so we see the gap between users.
    const openDb = () => (opens++ === 0 ? Promise.resolve(fakeDb) : new Promise<DeviceDb>(() => undefined));
    const stop = jest.fn();
    const startSync = jest.fn(() => fakeHandle({ stop }));
    const { rerender } = await render(
      <HomeScreen openDb={openDb} startSync={startSync} userId={USER} config={goodConfig} appVersion="0.1.0" />,
    );
    expect(await screen.findByText('3 waiting to send')).toBeTruthy();

    await rerender(
      <HomeScreen
        openDb={openDb}
        startSync={startSync}
        userId="22222222-0000-4000-8000-00000000000b"
        config={goodConfig}
        appVersion="0.1.0"
      />,
    );

    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('3 waiting to send')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  it('Sync now retries through the handle', async () => {
    const retryNow = jest.fn(() => Promise.resolve({ kind: 'done' as const, batches: 0, records: 0 }));
    await render(
      <HomeScreen
        openDb={openFakeDb}
        startSync={() => fakeHandle({ retryNow })}
        userId={USER}
        config={goodConfig}
        appVersion="0.1.0"
      />,
    );

    await fireEvent.press(await screen.findByRole('button', { name: 'Sync now' }));
    expect(retryNow).toHaveBeenCalledTimes(1);
  });
});

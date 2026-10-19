import { render, screen } from '@testing-library/react-native';

import Index from '../app/index';
import { SessionUserContext } from '../auth/session-user';
import type { DeviceDb } from '../db/device-db';
import { startSyncEngine, type SyncHandle } from '../sync/engine';

// This file is not under src/app, so expo-router does not take it for a route.
// It checks the wiring that decides whose records the home screen shows: the
// signed-in user's id must reach the sync engine, and no user means no engine.

// Jest hoists jest.mock above the imports.
const mockDb = {} as DeviceDb;
jest.mock('../config/public-config', () => ({
  readPublicConfig: () => ({
    ok: true,
    config: { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_abc' },
  }),
}));
jest.mock('../lib/app-db', () => ({ openAppDb: () => Promise.resolve(mockDb) }));
jest.mock('../lib/supabase', () => ({ getSupabase: () => ({}) }));
jest.mock('../sync/supabase-transport', () => ({ supabaseTransport: () => 'transport' }));
jest.mock('../sync/supabase-mirror-source', () => ({ supabaseMirrorSource: () => 'mirror-source' }));
jest.mock('../sync/engine', () => ({ startSyncEngine: jest.fn() }));

const USER = { id: '11111111-0000-4000-8000-00000000000a', email: 'a@example.com' };
const zero = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, rejected: 0 };

function handle(): SyncHandle {
  return {
    requestSync: jest.fn(),
    syncNow: jest.fn(),
    retryNow: jest.fn(),
    getStatus: () => ({
      counts: zero,
      attention: [],
      loaded: true,
      readFailed: false,
      lastPull: null,
      mirror: null,
      userId: USER.id,
      last: null,
      running: false,
    }),
    subscribe: () => () => undefined,
    stop: jest.fn(),
  };
}

describe('home route wiring', () => {
  beforeEach(() => {
    jest.mocked(startSyncEngine).mockReset().mockReturnValue(handle());
  });

  it("starts the sync engine for the signed-in user, with that user's id", async () => {
    await render(
      <SessionUserContext.Provider value={USER}>
        <Index />
      </SessionUserContext.Provider>,
    );

    expect(await screen.findByText('All your records are on the server')).toBeTruthy();
    expect(startSyncEngine).toHaveBeenCalledTimes(1);
    expect(startSyncEngine).toHaveBeenCalledWith(mockDb, 'transport', { userId: USER.id, mirrorSource: 'mirror-source' });
  });

  it('starts no engine when no user is signed in', async () => {
    await render(<Index />);

    expect(await screen.findByText('Device database ready')).toBeTruthy();
    expect(startSyncEngine).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });
});

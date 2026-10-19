import Constants from 'expo-constants';

import { readPublicConfig } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import { openAppDb } from '../lib/app-db';
import { getSupabase } from '../lib/supabase';
import { HomeScreen } from '../screens/HomeScreen';
import { startSyncEngine } from '../sync/engine';
import { supabaseTransport } from '../sync/supabase-transport';

const config = readPublicConfig();

// Module-level, so the reference is stable and the screen's effect runs once
// per mount. _layout.tsx remounts this screen when the signed-in user changes.
const startSync = config.ok
  ? (db: DeviceDb) => startSyncEngine(db, supabaseTransport(getSupabase(config.config)))
  : undefined;

export default function Index() {
  return (
    <HomeScreen
      openDb={openAppDb}
      startSync={startSync}
      config={config}
      appVersion={Constants.expoConfig?.version ?? 'unknown'}
    />
  );
}

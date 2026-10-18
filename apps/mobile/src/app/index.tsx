import Constants from 'expo-constants';

import { readPublicConfig } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import { openDeviceDb } from '../db/open-device-db';
import { getSupabase } from '../lib/supabase';
import { HomeScreen } from '../screens/HomeScreen';
import { startSyncEngine } from '../sync/engine';
import { supabaseMirrorSource } from '../sync/supabase-mirror-source';
import { supabaseTransport } from '../sync/supabase-transport';

const config = readPublicConfig();

// Module-level, so the reference is stable and the screen's effect runs once.
const startSync = config.ok
  ? (db: DeviceDb, userId?: string) => {
      const supabase = getSupabase(config.config);
      return startSyncEngine(db, supabaseTransport(supabase), undefined, {
        userId,
        mirrorSource: supabaseMirrorSource(supabase),
      });
    }
  : undefined;

export default function Index() {
  return (
    <HomeScreen
      openDb={openDeviceDb}
      startSync={startSync}
      config={config}
      appVersion={Constants.expoConfig?.version ?? 'unknown'}
    />
  );
}

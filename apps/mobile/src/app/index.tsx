import Constants from 'expo-constants';
import { router } from 'expo-router';

import { useSessionUser } from '../auth/session-user';
import { readPublicConfig } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import { openAppDb } from '../lib/app-db';
import { getSupabase } from '../lib/supabase';
import { HomeScreen } from '../screens/HomeScreen';
import { startSyncEngine } from '../sync/engine';
import { supabaseMirrorSource } from '../sync/supabase-mirror-source';
import { supabaseTransport } from '../sync/supabase-transport';

const config = readPublicConfig();

// Module-level, so the reference is stable and the screen's effect runs once
// per mount. _layout.tsx remounts this screen when the signed-in user changes.
const startSync = config.ok
  ? (db: DeviceDb, userId: string) => {
      const supabase = getSupabase(config.config);
      return startSyncEngine(db, supabaseTransport(supabase), {
        userId,
        mirrorSource: supabaseMirrorSource(supabase),
      });
    }
  : undefined;

export default function Index() {
  // The user the layout's sign-in gate let through. With none, nothing syncs.
  const user = useSessionUser();
  return (
    <HomeScreen
      openDb={openAppDb}
      startSync={startSync}
      userId={user?.id}
      onOpenAttendance={() => router.push('/attendance')}
      config={config}
      appVersion={Constants.expoConfig?.version ?? 'unknown'}
    />
  );
}

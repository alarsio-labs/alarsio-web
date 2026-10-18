import Constants from 'expo-constants';
import { ActivityIndicator, View } from 'react-native';

import { supabaseAuthClient } from '../auth/auth-client';
import { useSession } from '../auth/use-session';
import { readPublicConfig } from '../config/public-config';
import type { DeviceDb } from '../db/device-db';
import { openDeviceDb } from '../db/open-device-db';
import { getSupabase } from '../lib/supabase';
import { AccountBar } from '../screens/AccountBar';
import { HomeScreen } from '../screens/HomeScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { startSyncEngine } from '../sync/engine';
import { countUnsent } from '../sync/outbox';
import { supabaseTransport } from '../sync/supabase-transport';

const config = readPublicConfig();

// Module-level, so references are stable and effects run once.
const auth = config.ok ? supabaseAuthClient(getSupabase(config.config)) : undefined;
const startSync = config.ok
  ? (db: DeviceDb) => startSyncEngine(db, supabaseTransport(getSupabase(config.config)))
  : undefined;

// One database for the whole app session, shared by the home screen and sign-out.
let dbPromise: Promise<DeviceDb> | null = null;
const openDb = () => {
  dbPromise ??= openDeviceDb().catch((error: unknown) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
};
const countUnsentForUser = async (userId: string) => countUnsent(await openDb(), userId);

export default function Index() {
  const session = useSession(auth);
  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  // No config: the home screen explains what is missing.
  if (!auth) return <HomeScreen openDb={openDb} config={config} appVersion={appVersion} />;

  if (session.kind === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session.kind === 'signed_out') return <SignInScreen signIn={auth.signIn} />;

  // Keyed by user: a sign-in starts a fresh sync engine, which sends that
  // user's rows straight away; a sign-out stops it.
  return (
    <View style={{ flex: 1 }} key={session.user.id}>
      <AccountBar user={session.user} countUnsent={countUnsentForUser} signOut={auth.signOut} />
      <HomeScreen openDb={openDb} startSync={startSync} config={config} appVersion={appVersion} />
    </View>
  );
}

// The sign-in gate for every route, so a deep link (scheme "alarsio") cannot
// reach a screen while signed out. Owner of the gate: Identity (#56, ADR-026).

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { supabaseAuthClient } from '../auth/auth-client';
import { useSession } from '../auth/use-session';
import { readPublicConfig } from '../config/public-config';
import { openAppDb } from '../lib/app-db';
import { AUTH_STORAGE_KEY, authStorage, getSupabase } from '../lib/supabase';
import { AccountMenu } from '../screens/AccountMenu';
import { SignInScreen } from '../screens/SignInScreen';
import { countByStatus } from '../sync/outbox';

const config = readPublicConfig();
const auth = config.ok ? supabaseAuthClient(getSupabase(config.config), authStorage, AUTH_STORAGE_KEY) : undefined;

async function unsentCounts(userId: string) {
  const c = await countByStatus(await openAppDb(), userId);
  return { waiting: c.pending + c.syncing + c.failed, needFix: c.conflict + c.rejected };
}

export default function RootLayout() {
  const session = useSession(auth);

  // No config: let the home screen say what is missing.
  if (!auth) {
    return (
      <>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </>
    );
  }

  if (session.kind === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session.kind === 'signed_out') {
    return (
      <>
        <SignInScreen signIn={auth.signIn} />
        <StatusBar style="auto" />
      </>
    );
  }

  // Keyed by user: a sign-in mounts fresh screens and a fresh sync engine for
  // that user; sign-out unmounts them. Overlapping runs are safe since #67.
  return (
    <>
      <Stack
        key={session.user.id}
        screenOptions={{
          title: 'Alarsio',
          headerRight: () => <AccountMenu user={session.user} unsentCounts={unsentCounts} signOut={auth.signOut} />,
        }}
      />
      <StatusBar style="auto" />
    </>
  );
}

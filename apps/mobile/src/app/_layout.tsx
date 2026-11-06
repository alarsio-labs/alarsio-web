// The sign-in gate for every route, so a deep link (scheme "alarsio") cannot
// reach a screen while signed out. Owner of the gate: Identity (#56, ADR-031).

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { supabaseAuthClient } from '../auth/auth-client';
import { SessionUserContext } from '../auth/session-user';
import { useSession } from '../auth/use-session';
import { readPublicConfig } from '../config/public-config';
import { signOutAndClearMirrors } from '../auth/sign-out';
import { openAppDb } from '../lib/app-db';
import { AUTH_STORAGE_KEY, authStorage, getSupabase } from '../lib/supabase';
import { AccountMenu } from '../screens/AccountMenu';
import { SignInScreen } from '../screens/SignInScreen';
import { countByStatus } from '../sync/outbox';

// Keep the loam splash up until the session is known, so there is no white flash.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const config = readPublicConfig();
const auth = config.ok ? supabaseAuthClient(getSupabase(config.config), authStorage, AUTH_STORAGE_KEY) : undefined;

async function unsentCounts(userId: string) {
  const c = await countByStatus(await openAppDb(), userId);
  return { waiting: c.pending + c.syncing + c.failed, needFix: c.conflict + c.rejected };
}

// Sign-out also clears the offline copy of sites, materials and roster.
const signOutKeepingNothingBehind = () => (auth ? signOutAndClearMirrors(auth.signOut, openAppDb) : Promise.resolve());

export default function RootLayout() {
  const session = useSession(auth);

  // Hide the splash once the auth state is known: signed in, signed out, or no config.
  const ready = !auth || session.kind !== 'loading';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

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
    // The splash is still showing; render nothing under it.
    return null;
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
  // The context hands the screens the user, so each shows and syncs that
  // user's records only (ADR-029).
  return (
    <SessionUserContext.Provider value={session.user}>
      <Stack
        key={session.user.id}
        screenOptions={{
          title: 'Alarsio',
          headerRight: () => (
            <AccountMenu user={session.user} unsentCounts={unsentCounts} signOut={signOutKeepingNothingBehind} />
          ),
        }}
      />
      <StatusBar style="auto" />
    </SessionUserContext.Provider>
  );
}

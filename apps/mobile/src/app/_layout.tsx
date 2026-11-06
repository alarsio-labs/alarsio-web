// The sign-in gate for every route, so a deep link (scheme "alarsio") cannot
// reach a screen while signed out. Owner of the gate: Identity (#56, ADR-031).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
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
import { clearAccessCache, fetchCaptureAccess } from '../auth/role';
import { AccessGate } from '../screens/AccessGate';
import { AccountMenu } from '../screens/AccountMenu';
import { SignInScreen } from '../screens/SignInScreen';
import { StartupError } from '../screens/StartupError';
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
const signOutKeepingNothingBehind = () =>
  auth ? signOutAndClearMirrors(auth.signOut, openAppDb, () => clearAccessCache(AsyncStorage)) : Promise.resolve();

// The role read goes through the user's own session; RLS decides what comes back.
const supabase = config.ok ? getSupabase(config.config) : undefined;
const fetchAccessForUser = (userId: string) =>
  supabase ? fetchCaptureAccess(supabase, userId) : Promise.reject(new Error('No configuration'));

// Expo Router renders this when any screen throws, instead of a red error screen.
export function ErrorBoundary({ error }: ErrorBoundaryProps) {
  return <StartupError detail={error.message} />;
}

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
      <AccessGate
        key={session.user.id}
        user={session.user}
        fetchAccess={fetchAccessForUser}
        store={AsyncStorage}
        unsentCounts={unsentCounts}
        signOut={signOutKeepingNothingBehind}
      >
        <Stack
          screenOptions={{
            title: 'Alarsio',
            headerRight: () => (
              <AccountMenu user={session.user} unsentCounts={unsentCounts} signOut={signOutKeepingNothingBehind} />
            ),
          }}
        />
      </AccessGate>
      <StatusBar style="auto" />
    </SessionUserContext.Provider>
  );
}

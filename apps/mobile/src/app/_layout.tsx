// The sign-in gate for every route, so a deep link (scheme "alarsio") cannot
// reach a screen while signed out. Owner of the gate: Identity (#56, ADR-031).

import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  accessStore,
  auth,
  fetchAccessForUser,
  signOutKeepingNothingBehind,
  unsentCounts,
} from '../auth/app-auth';
import { SessionUserContext } from '../auth/session-user';
import { useSession } from '../auth/use-session';
import { openAppDb } from '../lib/app-db';
import { SyncBar } from '../sync/SyncBar';
import { AccessGate } from '../screens/AccessGate';
import { AccountMenu } from '../screens/AccountMenu';
import { BrandSplash } from '../screens/BrandSplash';
import { SignedOutFlow } from '../screens/SignedOutFlow';
import { StartupError } from '../screens/StartupError';
import { colors, fonts } from '../theme';
import { useBrandFonts } from '../ui/fonts';

// Keep the loam splash up until the session is known, so there is no white flash.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Expo Router renders this when any screen throws, instead of a red error screen.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <StartupError detail={error.message} onRetry={retry} />;
}

// Home already shows the sync panel, so the bar sits on every other screen.
function SyncBarOnOtherScreens({ userId }: { userId: string }) {
  const pathname = usePathname();
  if (pathname === '/') return null;
  return <SyncBar openDb={openAppDb} userId={userId} onOpen={() => router.navigate('/')} />;
}

// The header on every signed-in screen (docs/DESIGN.md, phone app v2.1).
const HEADER = {
  headerStyle: { backgroundColor: colors.cream },
  headerTintColor: colors.ink,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.cream },
} as const;

export default function RootLayout() {
  const session = useSession(auth);
  const fontsReady = useBrandFonts();
  // The brand splash (logo and one line) follows the native one on every cold start.
  const [splashDone, setSplashDone] = useState(false);

  // Hide the native splash once the auth state is known (signed in, signed out, or no
  // config) and the display font is in, so the brand splash takes over with no flash.
  const ready = (!auth || session.kind !== 'loading') && fontsReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) {
    // The native splash is still showing; render nothing under it.
    return null;
  }

  if (!splashDone) {
    return (
      <>
        <BrandSplash onDone={() => setSplashDone(true)} />
        <StatusBar style="light" />
      </>
    );
  }

  // No config: let the home screen say what is missing.
  if (!auth) {
    return (
      <>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </>
    );
  }

  // Not reached (ready waits for it), but it narrows the session for the code below.
  if (session.kind === 'loading') return null;

  if (session.kind === 'signed_out') {
    return (
      <>
        <SignedOutFlow signIn={auth.signIn} store={AsyncStorage} />
        <StatusBar style="light" />
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
        store={accessStore}
        unsentCounts={unsentCounts}
        signOut={signOutKeepingNothingBehind}
      >
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              ...HEADER,
              title: 'Alarsio',
              headerRight: () => (
                <AccountMenu
                  user={session.user}
                  unsentCounts={unsentCounts}
                  signOut={signOutKeepingNothingBehind}
                  onOpenAbout={() => router.push('/about')}
                />
              ),
            }}
          />
          <SyncBarOnOtherScreens userId={session.user.id} />
        </View>
      </AccessGate>
      <StatusBar style="dark" />
    </SessionUserContext.Provider>
  );
}

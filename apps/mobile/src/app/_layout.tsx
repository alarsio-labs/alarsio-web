// The sign-in gate for every route, so a deep link (scheme "alarsio") cannot
// reach a screen while signed out. Owner of the gate: Identity (#56, ADR-031).

import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import {
  accessStore,
  auth,
  fetchAccessForUser,
  signOutKeepingNothingBehind,
  unsentCounts,
} from '../auth/app-auth';
import { SessionUserContext } from '../auth/session-user';
import { useSession } from '../auth/use-session';
import { changeLanguage, startLanguage } from '../lib/app-language';
import { AccessGate } from '../screens/AccessGate';
import { AppHeader } from '../screens/AppHeader';
import { BrandSplash } from '../screens/BrandSplash';
import { SignedOutFlow } from '../screens/SignedOutFlow';
import { StartupError } from '../screens/StartupError';
import { colors } from '../theme';
import { useBrandFonts } from '../ui/fonts';

// Keep the native splash up until the session is known, so there is no white flash.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Expo Router renders this when any screen throws, instead of a red error screen.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <StartupError detail={error.message} onRetry={retry} />;
}

export default function RootLayout() {
  const session = useSession(auth);
  const fontsReady = useBrandFonts();
  const [languageReady, setLanguageReady] = useState(false);
  // The brand splash (logo and one line) follows the native one on every cold start.
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    void startLanguage().then(() => setLanguageReady(true));
  }, []);

  // Hide the native splash once the auth state, the fonts and the saved language are in,
  // so the brand splash takes over with no flash and in the right language.
  const ready = (!auth || session.kind !== 'loading') && fontsReady && languageReady;
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
        <SignedOutFlow signIn={auth.signIn} store={AsyncStorage} onChangeLanguage={changeLanguage} />
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
        <Stack
          screenOptions={{
            header: ({ options, back, navigation }) => (
              <AppHeader title={options.title ?? ''} onBack={back ? navigation.goBack : undefined} />
            ),
            contentStyle: { backgroundColor: colors.ground },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AccessGate>
      <StatusBar style="light" />
    </SessionUserContext.Provider>
  );
}

// What a signed-out phone sees after the splash: the tutorial on the first open, Sign in
// after that. "How Alarsio works" on Sign in brings the tutorial back.

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { SignInResult } from '../auth/auth-client';
import type { Language } from '../i18n';
import { hasSeenOnboarding, markOnboardingSeen, type SeenStore } from '../onboarding/seen-store';
import { brand } from '../theme';
import { OnboardingScreen } from './OnboardingScreen';
import { SignInScreen } from './SignInScreen';

export interface SignedOutFlowProps {
  signIn: (email: string, password: string) => Promise<SignInResult>;
  store: SeenStore;
  /** Shows the English / हिन्दी switch on Sign in. */
  onChangeLanguage?: (language: Language) => void;
}

export function SignedOutFlow({ signIn, store, onChangeLanguage }: SignedOutFlowProps) {
  // null while the flag is read: a plain loam ground, the same as the splash before it.
  const [tutorial, setTutorial] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hasSeenOnboarding(store).then((seen) => {
      if (!cancelled) setTutorial(!seen);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (tutorial === null) return <View style={{ flex: 1, backgroundColor: brand.loam }} />;
  if (tutorial) {
    return (
      <OnboardingScreen
        onDone={() => {
          setTutorial(false);
          void markOnboardingSeen(store);
        }}
      />
    );
  }
  return <SignInScreen signIn={signIn} onShowTutorial={() => setTutorial(true)} onChangeLanguage={onChangeLanguage} />;
}

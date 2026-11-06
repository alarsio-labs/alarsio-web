// Help and about. Reached from the header; the sign-in gate in _layout.tsx has already let the user through.

import Constants from 'expo-constants';
import { router } from 'expo-router';

import { signOutKeepingNothingBehind, unsentCounts } from '../auth/app-auth';
import { useSessionUser } from '../auth/session-user';
import { AboutScreen } from '../screens/AboutScreen';

export default function AboutRoute() {
  const user = useSessionUser();
  if (!user) return null;
  return (
    <AboutScreen
      user={user}
      appVersion={Constants.expoConfig?.version ?? 'unknown'}
      unsentCounts={unsentCounts}
      signOut={signOutKeepingNothingBehind}
      onOpenTutorial={() => router.push('/welcome')}
    />
  );
}

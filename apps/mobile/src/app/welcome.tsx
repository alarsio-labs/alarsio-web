import { router, Stack } from 'expo-router';

import { OnboardingScreen } from '../screens/OnboardingScreen';

// The tutorial again, opened from Help and about. Full screen, no header.
export default function Welcome() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OnboardingScreen doneLabel="Done" onDone={() => router.back()} />
    </>
  );
}

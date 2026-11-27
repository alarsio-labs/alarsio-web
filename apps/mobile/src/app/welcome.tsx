import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { OnboardingScreen } from '../screens/OnboardingScreen';

// The tutorial again, opened from Help and about. Full screen, no header.
export default function Welcome() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OnboardingScreen doneLabel={t('onboarding.done')} onDone={() => router.back()} />
    </>
  );
}

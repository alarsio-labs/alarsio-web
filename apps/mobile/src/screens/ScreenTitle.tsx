// Sets the header title of the screen it is rendered in. Renders nothing itself.

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { screenTitle, type ScreenKey } from '../lib/screen-title';

export function ScreenTitle({ screen, siteName }: { screen: ScreenKey; siteName?: string }) {
  // Re-renders when the language changes, so the title follows it.
  useTranslation();
  return <Stack.Screen options={{ title: screenTitle(screen, siteName) }} />;
}

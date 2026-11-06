// Sets the header title of the screen it is rendered in. Renders nothing itself.

import { Stack } from 'expo-router';

import { screenTitle, type ScreenKey } from '../lib/screen-title';

export function ScreenTitle({ screen, siteName }: { screen: ScreenKey; siteName?: string }) {
  return <Stack.Screen options={{ title: screenTitle(screen, siteName) }} />;
}

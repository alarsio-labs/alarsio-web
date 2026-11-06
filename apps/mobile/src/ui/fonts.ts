// The brand display face (Anton), bundled with the app, so nothing is fetched at start.
// The layout keeps the native splash up until this resolves; a font that fails to load
// falls back to the system bold, and the app still starts.

import { Anton_400Regular } from '@expo-google-fonts/anton';
import { useFonts } from 'expo-font';

export function useBrandFonts(): boolean {
  const [loaded, error] = useFonts({ Anton_400Regular });
  return loaded || error !== null;
}

// Fonts bundled with the app, so nothing is fetched at start: Anton for the wordmark and the
// splash/tutorial/sign-in titles, Noto Sans Devanagari for Hindi. The layout keeps the native
// splash up until this resolves; a font that fails to load falls back to the system font,
// and the app still starts.

import { Anton_400Regular } from '@expo-google-fonts/anton';
import { NotoSansDevanagari_400Regular, NotoSansDevanagari_700Bold } from '@expo-google-fonts/noto-sans-devanagari';
import { useFonts } from 'expo-font';

export function useBrandFonts(): boolean {
  const [loaded, error] = useFonts({ Anton_400Regular, NotoSansDevanagari_400Regular, NotoSansDevanagari_700Bold });
  return loaded || error !== null;
}

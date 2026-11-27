// The saved language choice. One value in AsyncStorage; it is not a record and never syncs.
// A store that cannot be read keeps English, so the worst case is the choice resetting.

import i18n, { type Language } from './index';

export const LANGUAGE_KEY = 'alarsio.language.v1';

/** The part of AsyncStorage this needs; injected so tests need no native module. */
export interface LanguageStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const isLanguage = (v: unknown): v is Language => v === 'en' || v === 'hi';

/** Applies the saved choice, else the device language (`deviceLanguage`, e.g. "hi"). */
export async function initLanguage(store: LanguageStore, deviceLanguage?: string | null): Promise<void> {
  try {
    const saved = await store.getItem(LANGUAGE_KEY);
    await i18n.changeLanguage(isLanguage(saved) ? saved : deviceLanguage === 'hi' ? 'hi' : 'en');
  } catch {
    // Keep English: the app still works.
  }
}

export async function setLanguage(language: Language, store: LanguageStore): Promise<void> {
  await i18n.changeLanguage(language);
  try {
    await store.setItem(LANGUAGE_KEY, language);
  } catch {
    // Not saved: the choice resets on the next start, which is harmless.
  }
}

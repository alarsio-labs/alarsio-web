// Whether this phone has seen the first-open tutorial. One flag in AsyncStorage; it is
// not a record and never syncs. A store that cannot be read counts as "not seen", so the
// worst case is the tutorial showing once more, never a phone stuck before sign-in.

export const SEEN_KEY = 'alarsio.onboarding.seen.v1';

/** The part of AsyncStorage this needs; injected so tests need no native module. */
export interface SeenStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function hasSeenOnboarding(store: SeenStore): Promise<boolean> {
  try {
    return (await store.getItem(SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(store: SeenStore): Promise<void> {
  try {
    await store.setItem(SEEN_KEY, '1');
  } catch {
    // Not saved: the tutorial shows again next time, which is harmless.
  }
}

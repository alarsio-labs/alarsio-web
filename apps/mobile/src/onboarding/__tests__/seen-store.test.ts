import { SEEN_KEY, hasSeenOnboarding, markOnboardingSeen, type SeenStore } from '../seen-store';

function memoryStore(): SeenStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

describe('onboarding seen flag', () => {
  it('is not seen on a new phone, and seen once marked', async () => {
    const store = memoryStore();
    expect(await hasSeenOnboarding(store)).toBe(false);
    await markOnboardingSeen(store);
    expect(store.data.get(SEEN_KEY)).toBe('1');
    expect(await hasSeenOnboarding(store)).toBe(true);
  });

  it('treats a store that cannot be read as not seen', async () => {
    const broken: SeenStore = {
      getItem: () => Promise.reject(new Error('disk')),
      setItem: () => Promise.reject(new Error('disk')),
    };
    expect(await hasSeenOnboarding(broken)).toBe(false);
    await expect(markOnboardingSeen(broken)).resolves.toBeUndefined();
  });
});

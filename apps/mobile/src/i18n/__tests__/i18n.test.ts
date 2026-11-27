import en from '../en.json';
import hi from '../hi.json';
import i18n from '../index';
import { initLanguage, LANGUAGE_KEY, setLanguage, type LanguageStore } from '../language';

type Tree = { [key: string]: string | Tree };

// Flat key list. English and Hindi plural forms differ by language rules, so "_one" and
// "_other" collapse to one key.
function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k.replace(/_(one|other)$/, '')}`] : keys(v, `${prefix}${k}.`),
  );
}

const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();

function strings(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : strings(v, `${prefix}${k}.`)));
}

function memoryStore(initial?: string): LanguageStore & { value: string | null } {
  const store = {
    value: initial ?? null,
    getItem: async () => store.value,
    setItem: async (_key: string, value: string) => {
      store.value = value;
    },
  };
  return store;
}

describe('translations', () => {
  it('Hindi has exactly the keys English has', () => {
    expect([...new Set(keys(hi as Tree))].sort()).toEqual([...new Set(keys(en as Tree))].sort());
  });

  it('every Hindi string keeps the same {{placeholders}} as English', () => {
    const hindi = new Map(strings(hi as Tree));
    for (const [key, text] of strings(en as Tree)) {
      expect({ key, p: placeholders(hindi.get(key) ?? '') }).toEqual({ key, p: placeholders(text) });
    }
  });
});

describe('language choice', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('uses the saved choice over the device language', async () => {
    await initLanguage(memoryStore('hi'), 'en');
    expect(i18n.language).toBe('hi');
  });

  it('uses Hindi for a Hindi device, English for anything else', async () => {
    await initLanguage(memoryStore(), 'hi');
    expect(i18n.language).toBe('hi');
    await initLanguage(memoryStore(), 'fr');
    expect(i18n.language).toBe('en');
  });

  it('ignores a saved value it does not know', async () => {
    await initLanguage(memoryStore('xx'), null);
    expect(i18n.language).toBe('en');
  });

  it('keeps English when the store cannot be read', async () => {
    await initLanguage({ getItem: () => Promise.reject(new Error('x')), setItem: async () => undefined }, 'hi');
    expect(i18n.language).toBe('en');
  });

  it('saves the choice, and still switches when saving fails', async () => {
    const store = memoryStore();
    await setLanguage('hi', store);
    expect(store.value).toBe('hi');
    expect(LANGUAGE_KEY).toBe('alarsio.language.v1');
    await setLanguage('en', { getItem: async () => null, setItem: () => Promise.reject(new Error('x')) });
    expect(i18n.language).toBe('en');
  });
});

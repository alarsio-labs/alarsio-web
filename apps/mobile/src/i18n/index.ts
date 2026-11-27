// English and Hindi (docs/DESIGN.md section 5). Strings are bundled, so nothing is fetched and it
// works offline. Importing this starts i18next in English; language.ts applies the saved choice.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import hi from './hi.json';

export type Language = 'en' | 'hi';

// `use` here is i18next's plugin loader, not a React hook.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
});

export default i18n;

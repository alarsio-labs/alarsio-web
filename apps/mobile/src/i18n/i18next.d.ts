// Makes t('key') type-checked against en.json, so a typo or a missing key fails typecheck.
import 'i18next';

import type en from './en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

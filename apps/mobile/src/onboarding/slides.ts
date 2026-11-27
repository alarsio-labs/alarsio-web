// The first-open tutorial: one slide per thing a supervisor does on the phone.
// Every claim is a feature in docs/FEATURES.md that runs on the phone today.
// The words are in src/i18n (en.json, hi.json) under "onboarding" and "splash".

import type { IconName } from '../ui/Icon';

export interface Slide {
  icon: IconName;
  titleKey: string;
  bodyKey: string;
}

export const SPLASH_LINE_KEY = 'splash.line';

export const SLIDES = [
  { icon: 'offline', titleKey: 'onboarding.slide1.title', bodyKey: 'onboarding.slide1.body' },
  { icon: 'checkIn', titleKey: 'onboarding.slide2.title', bodyKey: 'onboarding.slide2.body' },
  { icon: 'report', titleKey: 'onboarding.slide3.title', bodyKey: 'onboarding.slide3.body' },
  { icon: 'materials', titleKey: 'onboarding.slide4.title', bodyKey: 'onboarding.slide4.body' },
] as const satisfies readonly Slide[];

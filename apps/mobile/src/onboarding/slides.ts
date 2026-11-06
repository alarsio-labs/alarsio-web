// The first-open tutorial: one slide per thing a supervisor does on the phone.
// Every claim is a feature in docs/FEATURES.md that runs on the phone today.

import type { IconName } from '../ui/Icon';

export interface Slide {
  icon: IconName;
  title: string;
  body: string;
}

export const SPLASH_LINE = 'Site records with no signal. Attendance, reports and materials, even offline.';

export const SLIDES: Slide[] = [
  {
    icon: 'offline',
    title: 'Works with no signal',
    body: 'Everything you record is saved on this phone first, and sent when signal comes back.',
  },
  {
    icon: 'checkIn',
    title: 'Check in and mark attendance',
    body: 'Check in at the site, then mark everyone present in one tap and change only the exceptions.',
  },
  {
    icon: 'report',
    title: 'Daily report with photos',
    body: 'Work done, blockers, safety and photos. The headcount comes from the register.',
  },
  {
    icon: 'materials',
    title: 'Materials on site',
    body: 'Log what arrives and what is used, and see when stock runs low.',
  },
];

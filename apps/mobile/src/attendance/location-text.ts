// What the check-in screen says when the phone cannot give a location, one sentence per cause
// (phone review, 12 Nov 2026). Before, a refused permission, location turned off and a slow GPS
// all read "Location is not available", so a supervisor at the gate could not tell which to fix.
// Owner: Attendance (Manish). Each sentence still starts the old way, then says what to do.
// The words are in src/i18n (en.json, hi.json) under "attendance".

import i18n from '../i18n';
import type { UnavailableCause } from './location';

const t = i18n.t.bind(i18n);

export function locationProblemText(cause: UnavailableCause, action: 'in' | 'out'): string {
  const without = t(action === 'in' ? 'attendance.withoutIn' : 'attendance.withoutOut');
  switch (cause) {
    case 'denied':
      return t('attendance.location.denied', { without });
    case 'services_off':
      return t('attendance.location.servicesOff', { without });
    case 'timeout':
      return t('attendance.location.timeout', { without });
    case 'error':
      return t('attendance.location.error', { without });
  }
}

/** Only a refused permission is fixed in the app's settings; the other causes are not. */
export const opensSettings = (cause: UnavailableCause): boolean => cause === 'denied';

// What the check-in screen says when the phone cannot give a location, one sentence per cause
// (phone review, 12 Nov 2026). Before, a refused permission, location turned off and a slow GPS
// all read "Location is not available", so a supervisor at the gate could not tell which to fix.
// Owner: Attendance (Manish). Each sentence still starts the old way, then says what to do.

import type { UnavailableCause } from './location';

export function locationProblemText(cause: UnavailableCause, action: 'in' | 'out'): string {
  const without = `say why you are ${action === 'in' ? 'checking in' : 'checking out'} without it.`;
  switch (cause) {
    case 'denied':
      return `Location is not available: Alarsio is not allowed to use it on this phone. Allow it in Settings, then tap Try location again, or ${without}`;
    case 'services_off':
      return `Location is not available: location is turned off on this phone. Turn it on from the quick settings, then tap Try location again, or ${without}`;
    case 'timeout':
      return `Location is not available: the phone could not find where you are in time. Step into the open, then tap Try location again, or ${without}`;
    case 'error':
      return `Location is not available. Tap Try location again, or ${without}`;
  }
}

/** Only a refused permission is fixed in the app's settings; the other causes are not. */
export const opensSettings = (cause: UnavailableCause): boolean => cause === 'denied';

// The phone's location, behind an interface so tests need no native module.
// Owner: Attendance (Manish). Issue #79, ADR-034 D1.
//
// Location is read once, on the supervisor's tap, in the foreground (docs/SECURITY.md,
// DPDP). The interface has no way to watch or to run in the background, so no screen
// can ask for either. Failures are mapped to fixed causes: the library's message can
// carry a place, so it never leaves this file.

import * as Location from 'expo-location';

export type PermissionState = 'granted' | 'undetermined' | 'denied';

export type UnavailableCause = 'denied' | 'services_off' | 'timeout' | 'error';

export type PositionResult =
  | { kind: 'located'; lat: number; lng: number; accuracyM: number | null }
  | { kind: 'unavailable'; cause: UnavailableCause };

export interface LocationProvider {
  /** Whether the app may read the location. Never prompts. */
  getPermission(): Promise<PermissionState>;
  /** Shows the phone's own prompt, once the supervisor has seen why. */
  requestPermission(): Promise<PermissionState>;
  /** One fix, for this tap only. */
  readPosition(): Promise<PositionResult>;
}

/** How long a tap waits for a fix before offering the reason path. expo-location has no timeout of its own. */
export const POSITION_TIMEOUT_MS = 15_000;

function toState(response: { status: string; granted?: boolean }): PermissionState {
  if (response.granted === true || response.status === 'granted') return 'granted';
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

export function expoLocationProvider(timeoutMs: number = POSITION_TIMEOUT_MS): LocationProvider {
  return {
    async getPermission() {
      try {
        return toState(await Location.getForegroundPermissionsAsync());
      } catch {
        return 'denied';
      }
    },

    async requestPermission() {
      try {
        return toState(await Location.requestForegroundPermissionsAsync());
      } catch {
        return 'denied';
      }
    },

    async readPosition(): Promise<PositionResult> {
      try {
        if (!(await Location.hasServicesEnabledAsync())) return { kind: 'unavailable', cause: 'services_off' };

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), timeoutMs);
        });
        const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        // A fix that arrives after the time limit must not become an unhandled rejection.
        fix.catch(() => undefined);
        const got = await Promise.race([fix, timedOut]).finally(() => clearTimeout(timer));
        if (got === 'timeout') return { kind: 'unavailable', cause: 'timeout' };

        const { latitude, longitude, accuracy } = got.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { kind: 'unavailable', cause: 'error' };
        return {
          kind: 'located',
          lat: latitude,
          lng: longitude,
          accuracyM: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
        };
      } catch {
        return { kind: 'unavailable', cause: 'error' };
      }
    },
  };
}

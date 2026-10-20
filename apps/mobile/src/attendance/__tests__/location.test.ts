import * as ExpoLocation from 'expo-location';

import { expoLocationProvider } from '../location';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  // Anything that would track the phone. The provider must never touch these.
  watchPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
}));

const loc = jest.mocked(ExpoLocation);

describe('expoLocationProvider (#79 D1)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('maps the permission status to granted, denied or undetermined', async () => {
    const p = expoLocationProvider();
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true } as never);
    expect(await p.getPermission()).toBe('granted');
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false } as never);
    expect(await p.getPermission()).toBe('denied');
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', granted: false } as never);
    expect(await p.getPermission()).toBe('undetermined');
  });

  it('treats a permission call that throws as denied, never as granted', async () => {
    loc.getForegroundPermissionsAsync.mockRejectedValue(new Error('boom'));
    loc.requestForegroundPermissionsAsync.mockRejectedValue(new Error('boom'));
    const p = expoLocationProvider();
    expect(await p.getPermission()).toBe('denied');
    expect(await p.requestPermission()).toBe('denied');
  });

  it('reads one fix and reports its accuracy', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(true);
    loc.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 18.5, longitude: 73.8, accuracy: 7.6 } } as never);

    expect(await expoLocationProvider().readPosition()).toEqual({ kind: 'located', lat: 18.5, lng: 73.8, accuracyM: 7.6 });
    expect(loc.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('says services are off without asking for a fix', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(false);
    expect(await expoLocationProvider().readPosition()).toEqual({ kind: 'unavailable', cause: 'services_off' });
    expect(loc.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('gives up after the time limit, since the library has no timeout of its own', async () => {
    jest.useFakeTimers();
    try {
      loc.hasServicesEnabledAsync.mockResolvedValue(true);
      loc.getCurrentPositionAsync.mockReturnValue(new Promise(() => undefined));
      const result = expoLocationProvider(15_000).readPosition();
      await jest.advanceTimersByTimeAsync(15_000);
      expect(await result).toEqual({ kind: 'unavailable', cause: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports an error as unavailable, with no raw message', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(true);
    loc.getCurrentPositionAsync.mockRejectedValue(new Error('secret place 18.52,73.85'));
    expect(await expoLocationProvider().readPosition()).toEqual({ kind: 'unavailable', cause: 'error' });
  });

  it('refuses a fix that is not a real coordinate', async () => {
    loc.hasServicesEnabledAsync.mockResolvedValue(true);
    loc.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: Number.NaN, longitude: 73.8, accuracy: 5 } } as never);
    expect(await expoLocationProvider().readPosition()).toEqual({ kind: 'unavailable', cause: 'error' });
  });

  it('never watches, tracks in the background, or asks for background permission', async () => {
    loc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true } as never);
    loc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true } as never);
    loc.hasServicesEnabledAsync.mockResolvedValue(true);
    loc.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 18.5, longitude: 73.8, accuracy: 5 } } as never);
    const p = expoLocationProvider();
    await p.getPermission();
    await p.requestPermission();
    await p.readPosition();

    expect(loc.watchPositionAsync).not.toHaveBeenCalled();
    expect(loc.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(loc.startGeofencingAsync).not.toHaveBeenCalled();
    expect(loc.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

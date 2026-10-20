import { distanceM, estimateGeofence, roundCoordinate } from '../geofence';

// Pune pin used in the SQL suites' worked examples.
const SITE = { latitude: 18.5204, longitude: 73.8567, geofenceRadiusM: 200 };
const EARTH_RADIUS_M = 6371008.8;

/** A point `metres` due north of the pin: one degree of latitude is R * pi / 180 metres. */
const north = (metres: number) => ({
  lat: SITE.latitude + ((metres / EARTH_RADIUS_M) * 180) / Math.PI,
  lng: SITE.longitude,
});

describe('roundCoordinate', () => {
  it('keeps six decimals, as the numeric(9,6) column does', () => {
    expect(roundCoordinate(18.52264839)).toBe(18.522648);
    expect(roundCoordinate(73.8567004)).toBe(73.8567);
  });

  it('never returns negative zero', () => {
    expect(Object.is(roundCoordinate(-0.0000004), 0)).toBe(true);
  });
});

describe('distanceM (the server haversine, radius 6371008.8 m)', () => {
  it('is 0 for the same point', () => {
    expect(distanceM(SITE.latitude, SITE.longitude, SITE.latitude, SITE.longitude)).toBe(0);
  });

  it('measures 250 m due north within half a metre, on the coordinates that are sent', () => {
    const p = north(250);
    const d = distanceM(SITE.latitude, SITE.longitude, roundCoordinate(p.lat), roundCoordinate(p.lng));
    expect(Math.abs(d - 250)).toBeLessThan(0.5);
  });

  it('is finite at the antipode, where rounding could push asin past 1', () => {
    const d = distanceM(0, 0, 0, 180);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(Math.PI * EARTH_RADIUS_M, 0);
  });

  it('is symmetric', () => {
    const p = north(321);
    expect(distanceM(SITE.latitude, SITE.longitude, p.lat, p.lng)).toBeCloseTo(
      distanceM(p.lat, p.lng, SITE.latitude, SITE.longitude),
      6,
    );
  });
});

describe('estimateGeofence', () => {
  it('says inside 10 m within the radius', () => {
    const e = estimateGeofence(SITE, north(190));
    expect(e.outside).toBe(false);
    expect(e.radiusM).toBe(200);
    expect(Math.abs(e.distanceM - 190)).toBeLessThan(0.5);
  });

  it('says inside exactly on the radius (ADR-021 D8: greater than, not at least)', () => {
    // Zero distance against a zero radius: the only exact tie floats allow.
    expect(estimateGeofence({ ...SITE, geofenceRadiusM: 0 }, { lat: SITE.latitude, lng: SITE.longitude }).outside).toBe(
      false,
    );
    // And a radius equal to the measured distance of the point.
    const p = north(150);
    const measured = distanceM(SITE.latitude, SITE.longitude, roundCoordinate(p.lat), roundCoordinate(p.lng));
    expect(estimateGeofence({ ...SITE, geofenceRadiusM: measured }, p).outside).toBe(false);
  });

  it('says outside 10 m beyond the radius', () => {
    expect(estimateGeofence(SITE, north(210)).outside).toBe(true);
  });

  it('measures on the rounded coordinates that are sent, not on the raw fix', () => {
    // Two raw fixes that round to the same six decimals give the same answer.
    const a = estimateGeofence(SITE, { lat: 18.5226480001, lng: 73.8567 });
    const b = estimateGeofence(SITE, { lat: 18.5226484999, lng: 73.8567 });
    expect(a.distanceM).toBe(b.distanceM);
  });
});

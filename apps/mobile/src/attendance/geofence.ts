// The phone's estimate of the geofence. Owner: Attendance (Manish). Issue #79, ADR-034 D3.
//
// The database decides (ADR-021 D8): a trigger measures the coordinates the phone
// sends against the site's pin and flags the visit. This is only the phone's guess
// at that answer, so the supervisor can be asked for a reason before the record is
// saved. It uses the server's formula and the server's input: the coordinates
// rounded to six decimals, as numeric(9,6) stores them. It can still differ from
// the server at the exact edge (float against numeric) and when the radius changed
// after the last pull; the server's answer wins and comes back as a verdict.

/** Mean Earth radius in metres, as attendance_distance_m uses it. */
export const EARTH_RADIUS_M = 6371008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** A coordinate as it is sent and stored: six decimals, never negative zero. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6 + 0;
}

/** Great-circle distance in metres, the same haversine as the server's attendance_distance_m. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const half = (x: number) => Math.sin(x / 2) ** 2;
  const a = half(toRadians(lat2 - lat1)) + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * half(toRadians(lng2 - lng1));
  // Clamped, so a rounding error at the antipode cannot push asin past 1.
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(Math.max(0, a))));
}

export interface GeofenceSite {
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
}

export interface GeofenceEstimate {
  distanceM: number;
  radiusM: number;
  /** Strictly greater than the radius. Exactly on the radius is inside (ADR-021 D8). */
  outside: boolean;
}

export function estimateGeofence(site: GeofenceSite, point: { lat: number; lng: number }): GeofenceEstimate {
  const d = distanceM(site.latitude, site.longitude, roundCoordinate(point.lat), roundCoordinate(point.lng));
  return { distanceM: d, radiusM: site.geofenceRadiusM, outside: d > site.geofenceRadiusM };
}

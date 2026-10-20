import type { MessageCode } from "../messages";

// Checks what a manager typed, to say what is wrong before the database does.
// The database is the boundary: sites has CHECKs on all of this (ADR-007), and
// RLS decides who may write. These make the message specific.

const MAX_NAME = 120;
const MAX_ADDRESS = 500;
const MIN_RADIUS_M = 50;
const MAX_RADIUS_M = 2000;
// Plain decimals only, so "1e3", "0x10", "NaN" and "12,5" never become a number.
// Up to 15 decimals are read and then rounded to the 6 the column keeps.
const COORDINATE = /^-?\d{1,3}(\.\d{1,15})?$/;
const RADIUS = /^\d{1,4}$/;

/** The four statuses a manager may set. `archived` is reached only through archive_site(). */
export const SITE_STATUSES = ["planned", "active", "paused", "completed"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export function isSiteStatus(v: unknown): v is SiteStatus {
  return typeof v === "string" && (SITE_STATUSES as readonly string[]).includes(v);
}

export type SiteInput = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
};

type Raw = { name: unknown; address: unknown; latitude: unknown; longitude: unknown; radius: unknown };
type Fail = { ok: false; code: MessageCode };

/** The trimmed text when its length in characters is within bounds, else null. */
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  // Characters, not UTF-16 units: the database counts char_length.
  const length = Array.from(text).length;
  return length >= 1 && length <= max ? text : null;
}

/** A coordinate rounded to 6 places and held to [-limit, limit] after rounding, as the column does. */
function cleanCoordinate(v: unknown, limit: number): number | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!COORDINATE.test(t)) return null;
  const n = Number(Number(t).toFixed(6));
  return Math.abs(n) <= limit ? n : null;
}

function cleanRadius(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!RADIUS.test(t)) return null;
  const n = Number(t);
  return n >= MIN_RADIUS_M && n <= MAX_RADIUS_M ? n : null;
}

/** Reports the first wrong field, in the order the form shows them. */
export function cleanSiteInput(raw: Raw): { ok: true; value: SiteInput } | Fail {
  const name = cleanText(raw.name, MAX_NAME);
  if (name === null) return { ok: false, code: "site_name" };
  const address = cleanText(raw.address, MAX_ADDRESS);
  if (address === null) return { ok: false, code: "site_address" };
  const latitude = cleanCoordinate(raw.latitude, 90);
  if (latitude === null) return { ok: false, code: "site_latitude" };
  const longitude = cleanCoordinate(raw.longitude, 180);
  if (longitude === null) return { ok: false, code: "site_longitude" };
  const radius = cleanRadius(raw.radius);
  if (radius === null) return { ok: false, code: "site_radius" };
  return { ok: true, value: { name, address, latitude, longitude, geofence_radius_m: radius } };
}

/** Only the answers a manager can act on. Anything else is the generic message. */
export function siteErrorCode(sqlstate: string | undefined): MessageCode {
  if (sqlstate === "42501") return "site_forbidden";
  if (sqlstate === "23505") return "site_exists";
  return "generic";
}

/** The "find on map" link, built from numbers so no typed text reaches the URL. */
export function mapUrl(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

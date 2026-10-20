// A site visit as the phone holds it, and the payload sync_site_visits accepts.
// Owner: Attendance (Manish). Issue #79, ADR-034. Server side: ADR-021, ADR-033.
//
// One visit is one outbox record, and every save carries the whole visit: the
// check-in always, the check-out once there is one (ADR-033 D2). Nothing here
// touches the database or the clock: callers pass the time in.

import { istDate } from '../sync/pull';
import type { OutboxStatus } from '../sync/entities';
import { reasonText } from '../sync/status-text';
import { roundCoordinate } from './geofence';

/** Added to the reason of a visit sent without a location (ADR-034 D1). */
export const LOCATION_UNAVAILABLE_PREFIX = 'Location not shared: ';
/** The most characters the server keeps of a reason (ADR-021). */
export const REASON_MAX = 500;

export type VisitErrorCode =
  | 'no_org'
  | 'bad_coordinates'
  | 'reason_required'
  | 'reason_too_long'
  | 'before_check_in'
  | 'already_checked_out'
  | 'not_found'
  | 'not_refused';

export class VisitError extends Error {
  constructor(readonly code: VisitErrorCode) {
    super(code);
    this.name = 'VisitError';
  }
}

/** One end of a visit: when, where, and why if the supervisor had to say. */
export interface VisitLeg {
  /** The phone's clock, ISO 8601 (ADR-021 D7). */
  at: string;
  lat: number;
  lng: number;
  reason: string | null;
}

export interface Visit {
  orgId: string;
  siteId: string;
  checkIn: VisitLeg;
  checkOut: VisitLeg | null;
}

/** Where a leg was taken: a real fix, or no location at all and the reason why. */
export type Placement =
  | { kind: 'located'; lat: number; lng: number; reason: string | null }
  | { kind: 'unavailable'; reason: string };

/** The part of a mirrored site a visit needs. */
export interface SiteRef {
  id: string;
  orgId: string | null;
}

const trimmed = (raw: string | null): string | null => {
  const t = (raw ?? '').trim();
  return t === '' ? null : t;
};

function assertLength(reason: string): string {
  if (reason.length > REASON_MAX) throw new VisitError('reason_too_long');
  return reason;
}

function legAt(placement: Placement, now: Date): VisitLeg {
  const at = now.toISOString();
  if (placement.kind === 'unavailable') {
    // The server cannot take a visit with no coordinates, so it gets 0, 0: far
    // outside any fence, flagged, and with a mandatory reason (ADR-034 D1).
    const why = trimmed(placement.reason);
    if (why === null) throw new VisitError('reason_required');
    return { at, lat: 0, lng: 0, reason: assertLength(`${LOCATION_UNAVAILABLE_PREFIX}${why}`) };
  }
  const lat = roundCoordinate(placement.lat);
  const lng = roundCoordinate(placement.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new VisitError('bad_coordinates');
  }
  const why = trimmed(placement.reason);
  return { at, lat, lng, reason: why === null ? null : assertLength(why) };
}

export function checkInVisit(site: SiteRef, placement: Placement, now: Date): Visit {
  if (site.orgId === null) throw new VisitError('no_org');
  return { orgId: site.orgId, siteId: site.id, checkIn: legAt(placement, now), checkOut: null };
}

export function checkOutVisit(visit: Visit, placement: Placement, now: Date): Visit {
  if (visit.checkOut !== null) throw new VisitError('already_checked_out');
  const leg = legAt(placement, now);
  // The table refuses a check-out before the check-in (23514): refuse it here, saying why.
  if (Date.parse(leg.at) < Date.parse(visit.checkIn.at)) throw new VisitError('before_check_in');
  return { ...visit, checkOut: leg };
}

/** Puts a reason on the latest leg of a refused visit (ADR-034 D3). */
export function withReason(visit: Visit, reason: string): Visit {
  const why = trimmed(reason);
  if (why === null) throw new VisitError('reason_required');
  assertLength(why);
  return visit.checkOut === null
    ? { ...visit, checkIn: { ...visit.checkIn, reason: why } }
    : { ...visit, checkOut: { ...visit.checkOut, reason: why } };
}

/**
 * The payload sync_site_visits reads (20261028100000_sync_site_visits.sql). Every
 * key is always there, null where there is nothing yet, so its shape never changes.
 */
export function buildPayload(visit: Visit): Record<string, unknown> {
  const out = visit.checkOut;
  return {
    org_id: visit.orgId,
    site_id: visit.siteId,
    check_in_at: visit.checkIn.at,
    check_in_lat: visit.checkIn.lat,
    check_in_lng: visit.checkIn.lng,
    check_in_reason: visit.checkIn.reason,
    check_out_at: out?.at ?? null,
    check_out_lat: out?.lat ?? null,
    check_out_lng: out?.lng ?? null,
    check_out_reason: out?.reason ?? null,
  };
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
// A time the screen can work a day out of: istDate throws on anything else.
const isTime = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

/** Reads a visit back from an outbox payload, or null if it is not one. */
export function parsePayload(payload: unknown): Visit | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (
    !isString(p.org_id) ||
    !isString(p.site_id) ||
    !isTime(p.check_in_at) ||
    !isNumber(p.check_in_lat) ||
    !isNumber(p.check_in_lng) ||
    !(p.check_in_reason === null || isString(p.check_in_reason))
  ) {
    return null;
  }
  const checkIn: VisitLeg = { at: p.check_in_at, lat: p.check_in_lat, lng: p.check_in_lng, reason: p.check_in_reason };

  const anyOut = p.check_out_at !== null || p.check_out_lat !== null || p.check_out_lng !== null;
  if (!anyOut) {
    return p.check_out_reason === null ? { orgId: p.org_id, siteId: p.site_id, checkIn, checkOut: null } : null;
  }
  if (
    !isTime(p.check_out_at) ||
    !isNumber(p.check_out_lat) ||
    !isNumber(p.check_out_lng) ||
    !(p.check_out_reason === null || isString(p.check_out_reason))
  ) {
    return null;
  }
  const checkOut: VisitLeg = { at: p.check_out_at, lat: p.check_out_lat, lng: p.check_out_lng, reason: p.check_out_reason };
  return { orgId: p.org_id, siteId: p.site_id, checkIn, checkOut };
}

/** The Asia/Kolkata calendar day of the check-in (YYYY-MM-DD). */
export function istDay(visit: Visit): string {
  return istDate(visit.checkIn.at);
}

/** HH:mm on the Asia/Kolkata clock, whatever zone the phone is set to. */
export function istTime(timestamp: string): string {
  const ms = Date.parse(timestamp);
  return new Date(ms + 5.5 * 3_600_000).toISOString().slice(11, 16);
}

export type StatusTone = 'wait' | 'ok' | 'attention';

// What a visit's refusal means to a supervisor. The codes are the handler's
// (ADR-033); anything else falls back to the shared wording.
const VISIT_REASONS: Record<string, string> = {
  checked_out: 'This visit was already checked out, on another phone or with other details.',
  different_visit: 'The server already holds a different visit under this record.',
  invalid_input: "Something in this visit isn't valid. If you were outside the site, add a reason and send again.",
};

/**
 * What a visit says about itself. Only a synced visit is "on the server"; nothing
 * else is called sent or submitted (ADR-009). Conflict and refused are both
 * "needs attention" (#68), with a reason in plain words and never a raw code.
 */
export function visitStatusText(status: OutboxStatus, reason: string | null): { tone: StatusTone; text: string } {
  switch (status) {
    case 'pending':
    case 'syncing':
      return { tone: 'wait', text: 'Saved on this phone, waiting to send' };
    case 'failed':
      return { tone: 'wait', text: 'Could not send yet. Will retry.' };
    case 'synced':
      return { tone: 'ok', text: 'On the server' };
    case 'conflict':
    case 'rejected':
      return {
        tone: 'attention',
        text: `Needs attention · ${(reason !== null ? VISIT_REASONS[reason] : undefined) ?? reasonText(reason)}`,
      };
  }
}

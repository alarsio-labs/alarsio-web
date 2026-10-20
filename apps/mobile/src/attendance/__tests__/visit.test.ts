import {
  buildPayload,
  checkInVisit,
  checkOutVisit,
  istDay,
  LOCATION_UNAVAILABLE_PREFIX,
  parsePayload,
  visitStatusText,
  VisitError,
  type Placement,
  type Visit,
} from '../visit';

const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = '51000000-0000-4000-8000-000000000001';
const SITE_REF = { id: SITE, orgId: ORG };
const T_IN = new Date('2026-10-20T03:40:00.000Z'); // 09:10 IST
const T_OUT = new Date('2026-10-20T12:00:00.000Z'); // 17:30 IST
const HERE: Placement = { kind: 'located', lat: 18.5204, lng: 73.8567, reason: null };

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof VisitError ? error.code : `other:${String(error)}`;
  }
  return undefined;
};

/**
 * The checks sync_site_visits makes on a payload before it touches a table
 * (supabase/migrations/20261028100000_sync_site_visits.sql), written out again
 * here so a drift on either side fails a test. Returns the first problem, or null.
 */
function handlerProblem(p: Record<string, unknown>): string | null {
  const types: Record<string, string[]> = {
    org_id: ['string'],
    site_id: ['string'],
    check_in_at: ['string'],
    check_in_lat: ['number'],
    check_in_lng: ['number'],
    check_in_reason: ['string', 'null'],
    check_out_at: ['string', 'null'],
    check_out_lat: ['number', 'null'],
    check_out_lng: ['number', 'null'],
    check_out_reason: ['string', 'null'],
  };
  const typeOf = (v: unknown) => (v === null || v === undefined ? 'null' : typeof v);
  for (const [key, allowed] of Object.entries(types)) {
    if (!allowed.includes(typeOf(p[key]))) return `field ${key}`;
  }
  const iso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
  if (!iso.test(p.check_in_at as string)) return 'check_in_at not ISO';
  if (typeof p.check_out_at === 'string' && !iso.test(p.check_out_at)) return 'check_out_at not ISO';
  const hasOut = p.check_out_at != null || p.check_out_lat != null || p.check_out_lng != null;
  if (hasOut && (p.check_out_at == null || p.check_out_lat == null || p.check_out_lng == null)) return 'leg';
  if (!hasOut && p.check_out_reason != null) return 'reason without check-out';
  for (const key of ['check_in_reason', 'check_out_reason']) {
    const r = p[key];
    if (typeof r === 'string' && (r !== r.trim() || r.length < 1 || r.length > 500)) return `${key} bounds`;
  }
  for (const key of ['check_in_lat', 'check_in_lng', 'check_out_lat', 'check_out_lng']) {
    const n = p[key];
    if (typeof n === 'number' && Math.abs(Math.round(n * 1e6) / 1e6 - n) > 1e-9) return `${key} decimals`;
  }
  if ((p.check_in_lat as number) < -90 || (p.check_in_lat as number) > 90) return 'latitude range';
  return null;
}

describe('checkInVisit', () => {
  it('builds a visit the handler accepts: required fields typed, ISO time, no check-out yet', () => {
    const visit = checkInVisit(SITE_REF, HERE, T_IN);
    const payload = buildPayload(visit);
    expect(handlerProblem(payload)).toBeNull();
    expect(payload).toEqual({
      org_id: ORG,
      site_id: SITE,
      check_in_at: '2026-10-20T03:40:00.000Z',
      check_in_lat: 18.5204,
      check_in_lng: 73.8567,
      check_in_reason: null,
      check_out_at: null,
      check_out_lat: null,
      check_out_lng: null,
      check_out_reason: null,
    });
  });

  it('rounds coordinates to six decimals before they are sent', () => {
    const visit = checkInVisit(SITE_REF, { ...HERE, lat: 18.52264839, lng: 73.85670049 }, T_IN);
    expect(visit.checkIn.lat).toBe(18.522648);
    expect(visit.checkIn.lng).toBe(73.8567);
  });

  it('trims a reason and sends null for a blank one', () => {
    expect(checkInVisit(SITE_REF, { ...HERE, reason: '  at the gate  ' }, T_IN).checkIn.reason).toBe('at the gate');
    expect(checkInVisit(SITE_REF, { ...HERE, reason: '   ' }, T_IN).checkIn.reason).toBeNull();
  });

  it('accepts a reason of 500 characters and refuses 501', () => {
    expect(checkInVisit(SITE_REF, { ...HERE, reason: 'a'.repeat(500) }, T_IN).checkIn.reason).toHaveLength(500);
    expect(code(() => checkInVisit(SITE_REF, { ...HERE, reason: 'a'.repeat(501) }, T_IN))).toBe('reason_too_long');
  });

  it('refuses a site whose org_id has not reached the phone yet', () => {
    expect(code(() => checkInVisit({ id: SITE, orgId: null }, HERE, T_IN))).toBe('no_org');
  });

  it('refuses coordinates that cannot exist, instead of sending them', () => {
    expect(code(() => checkInVisit(SITE_REF, { ...HERE, lat: 91 }, T_IN))).toBe('bad_coordinates');
    expect(code(() => checkInVisit(SITE_REF, { ...HERE, lng: -181 }, T_IN))).toBe('bad_coordinates');
    expect(code(() => checkInVisit(SITE_REF, { ...HERE, lat: Number.NaN }, T_IN))).toBe('bad_coordinates');
  });

  describe('when the location is not available (D1)', () => {
    const unavailable = (reason: string): Placement => ({ kind: 'unavailable', reason });

    it('needs a reason: blank is refused', () => {
      expect(code(() => checkInVisit(SITE_REF, unavailable(''), T_IN))).toBe('reason_required');
      expect(code(() => checkInVisit(SITE_REF, unavailable('   '), T_IN))).toBe('reason_required');
    });

    it('is sent at 0, 0 with the reason prefixed, so the server flags it outside and keeps the reason', () => {
      const visit = checkInVisit(SITE_REF, unavailable('phone has no GPS'), T_IN);
      expect(visit.checkIn).toEqual({
        at: '2026-10-20T03:40:00.000Z',
        lat: 0,
        lng: 0,
        reason: `${LOCATION_UNAVAILABLE_PREFIX}phone has no GPS`,
      });
      expect(handlerProblem(buildPayload(visit))).toBeNull();
    });

    it('keeps the whole reason, prefix included, within 500 characters', () => {
      const room = 500 - LOCATION_UNAVAILABLE_PREFIX.length;
      const ok = checkInVisit(SITE_REF, unavailable('a'.repeat(room)), T_IN);
      expect(ok.checkIn.reason).toHaveLength(500);
      expect(code(() => checkInVisit(SITE_REF, unavailable('a'.repeat(room + 1)), T_IN))).toBe('reason_too_long');
    });
  });
});

describe('checkOutVisit', () => {
  const visit = checkInVisit(SITE_REF, HERE, T_IN);

  it('keeps the check-in fields and fills the whole check-out leg', () => {
    const out = checkOutVisit(visit, { kind: 'located', lat: 18.5205, lng: 73.8568, reason: null }, T_OUT);
    expect(out.checkIn).toEqual(visit.checkIn);
    expect(out.checkOut).toEqual({ at: '2026-10-20T12:00:00.000Z', lat: 18.5205, lng: 73.8568, reason: null });
    expect(handlerProblem(buildPayload(out))).toBeNull();
  });

  it('refuses a time before the check-in (the table refuses it too)', () => {
    expect(code(() => checkOutVisit(visit, HERE, new Date('2026-10-20T03:39:59.000Z')))).toBe('before_check_in');
  });

  it('allows the same instant', () => {
    expect(checkOutVisit(visit, HERE, T_IN).checkOut?.at).toBe(visit.checkIn.at);
  });

  it('refuses a second check-out of the same visit', () => {
    const out = checkOutVisit(visit, HERE, T_OUT);
    expect(code(() => checkOutVisit(out, HERE, new Date('2026-10-20T13:00:00.000Z')))).toBe('already_checked_out');
  });

  it('uses the same location rules: unavailable needs a reason', () => {
    expect(code(() => checkOutVisit(visit, { kind: 'unavailable', reason: '' }, T_OUT))).toBe('reason_required');
    const out = checkOutVisit(visit, { kind: 'unavailable', reason: 'no signal' }, T_OUT);
    expect(out.checkOut).toMatchObject({ lat: 0, lng: 0, reason: `${LOCATION_UNAVAILABLE_PREFIX}no signal` });
  });
});

describe('parsePayload', () => {
  it('reads back what buildPayload wrote', () => {
    const out = checkOutVisit(checkInVisit(SITE_REF, HERE, T_IN), HERE, T_OUT);
    expect(parsePayload(buildPayload(out))).toEqual(out);
  });

  it('returns null for anything that is not a visit, instead of guessing', () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload({})).toBeNull();
    expect(parsePayload({ ...buildPayload(checkInVisit(SITE_REF, HERE, T_IN)), check_in_lat: 'x' })).toBeNull();
    // A time that is not a time would throw when the screen works out the day.
    const good = buildPayload(checkInVisit(SITE_REF, HERE, T_IN));
    expect(parsePayload({ ...good, check_in_at: 'not a time' })).toBeNull();
    expect(parsePayload({ ...good, check_out_at: 'x', check_out_lat: 1, check_out_lng: 1 })).toBeNull();
    // A half check-out leg is not a visit.
    expect(parsePayload({ ...buildPayload(checkInVisit(SITE_REF, HERE, T_IN)), check_out_at: T_OUT.toISOString() })).toBeNull();
  });
});

describe('istDay', () => {
  it('is the Asia/Kolkata calendar day of the check-in', () => {
    const late = checkInVisit(SITE_REF, HERE, new Date('2026-10-20T19:00:00.000Z')); // 00:30 IST next day
    expect(istDay(late)).toBe('2026-10-21');
    expect(istDay(checkInVisit(SITE_REF, HERE, T_IN))).toBe('2026-10-20');
  });
});

describe('visitStatusText: only an accepted visit is on the server', () => {
  const words = (status: Parameters<typeof visitStatusText>[0], reason: string | null = null) =>
    visitStatusText(status, reason);

  it('says saved on this phone while it is pending or syncing, never sent', () => {
    for (const s of ['pending', 'syncing'] as const) {
      const t = words(s);
      expect(t.text).toBe('Saved on this phone, waiting to send');
      expect(t.text).not.toMatch(/submitted|on the server/i);
      expect(t.tone).toBe('wait');
    }
  });

  it('says it will retry for a failed one', () => {
    expect(words('failed').text).toBe('Could not send yet. Will retry.');
  });

  it('says on the server only for synced', () => {
    expect(words('synced')).toEqual({ tone: 'ok', text: 'On the server' });
  });

  it('shows conflict and rejected as needs attention, with a plain reason and no raw code', () => {
    for (const s of ['conflict', 'rejected'] as const) {
      const t = words(s, 'permission_denied');
      expect(t.tone).toBe('attention');
      expect(t.text).toMatch(/^Needs attention/);
      expect(t.text).not.toContain('permission_denied');
    }
    expect(words('conflict', 'checked_out').text).toMatch(/already/i);
    expect(words('conflict', 'different_visit').text).not.toContain('different_visit');
    expect(words('rejected', 'invalid_input').text).toMatch(/reason/i);
  });
});

describe('a visit keeps its order of legs', () => {
  it('has no check-out until one is made', () => {
    const v: Visit = checkInVisit(SITE_REF, HERE, T_IN);
    expect(v.checkOut).toBeNull();
  });
});

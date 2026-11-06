import { attentionRoute } from '../attention-route';

const SITE = '51000000-0000-4000-8000-000000000001';
const row = (entity: Parameters<typeof attentionRoute>[0]['entity'], siteId: string | null = SITE, day: string | null = null) => ({
  entity,
  siteId,
  day,
});

describe('attentionRoute', () => {
  it('opens a site visit at the site check-in screen', () => {
    expect(attentionRoute(row('site_visits'))).toBe(`/attendance/${SITE}`);
  });

  it.each(['attendance_days', 'attendance_entries', 'attendance_corrections'] as const)(
    'opens %s at the day register',
    (entity) => {
      expect(attentionRoute(row(entity, SITE, '2026-11-05'))).toBe(`/attendance/register/${SITE}`);
    },
  );

  it('opens a daily report on its own day, or without one when the day is unknown', () => {
    expect(attentionRoute(row('daily_reports', SITE, '2026-11-05'))).toBe(`/reports/${SITE}?date=2026-11-05`);
    expect(attentionRoute(row('daily_reports'))).toBe(`/reports/${SITE}`);
  });

  it('opens a material entry at the site materials screen', () => {
    expect(attentionRoute(row('material_transactions'))).toBe(`/materials/${SITE}`);
  });

  it('has nothing to open for a photo, or for any row with no site', () => {
    expect(attentionRoute(row('report_photos'))).toBeNull();
    for (const entity of ['site_visits', 'attendance_days', 'attendance_entries', 'attendance_corrections', 'daily_reports', 'material_transactions'] as const) {
      expect(attentionRoute(row(entity, null))).toBeNull();
    }
  });
});

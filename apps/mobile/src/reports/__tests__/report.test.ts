import {
  buildPayload,
  buildReport,
  charCount,
  dayLabel,
  headcountHint,
  isFlagged,
  needsReason,
  openingFields,
  parsePayload,
  REPORT_LIMITS,
  reportDay,
  reportErrorText,
  ReportError,
  reportStatusText,
  reportCardStatus,
  sentBackNote,
  type Report,
  type ReportFields,
} from '../report';

const ORG = '0a0a0a0a-0000-4000-8000-0000000000a1';
const SITE = { id: '51000000-0000-4000-8000-000000000001', orgId: ORG };
const DAY = '2026-10-20';

const fields = (over: Partial<ReportFields> = {}): ReportFields => ({
  headcount: '12',
  workDone: 'Slab poured on level 2',
  blockers: '',
  seriousBlocker: false,
  safetyIncident: false,
  nextDayPlan: 'Cure the slab',
  ...over,
});

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ReportError) return e.code;
    throw e;
  }
  throw new Error('expected a ReportError');
};

const submitted = (over: Partial<ReportFields> = {}): Report =>
  buildReport(SITE, DAY, fields(over), 'submitted', { previous: null });

describe('report model (#81)', () => {
  describe('the payload sync_daily_reports reads (ADR-022 H2)', () => {
    it('has exactly the eleven keys of the handler, each with its JSON type', () => {
      const payload = buildPayload(submitted());

      expect(Object.keys(payload).sort()).toEqual(
        [
          'blockers',
          'edit_reason',
          'headcount',
          'next_day_plan',
          'org_id',
          'report_date',
          'safety_incident',
          'serious_blocker',
          'site_id',
          'status',
          'work_done',
        ].sort(),
      );
      expect(payload).toEqual({
        org_id: ORG,
        site_id: SITE.id,
        report_date: DAY,
        status: 'submitted',
        headcount: 12,
        work_done: 'Slab poured on level 2',
        blockers: null,
        serious_blocker: false,
        safety_incident: false,
        next_day_plan: 'Cure the slab',
        edit_reason: null,
      });
    });

    it('sends the headcount as a number, never the typed text', () => {
      expect(typeof buildPayload(submitted({ headcount: ' 7 ' })).headcount).toBe('number');
    });

    it('sends blank text as null, and trims what is kept', () => {
      const payload = buildPayload(
        buildReport(SITE, DAY, fields({ headcount: '', workDone: '  ', nextDayPlan: '  plan  ' }), 'draft', {
          previous: null,
        }),
      );
      expect(payload).toMatchObject({ headcount: null, work_done: null, next_day_plan: 'plan' });
    });

    it('reads back what it wrote, and refuses anything else', () => {
      const report = submitted({ blockers: 'Crane down', seriousBlocker: true });
      expect(parsePayload(buildPayload(report))).toEqual(report);

      expect(parsePayload(null)).toBeNull();
      expect(parsePayload({ ...buildPayload(report), status: 'reviewed' })).toBeNull();
      expect(parsePayload({ ...buildPayload(report), headcount: '12' })).toBeNull();
      expect(parsePayload({ ...buildPayload(report), report_date: '20-10-2026' })).toBeNull();
    });
  });

  describe('what a draft and a submit need (ADR-013 R1, R4)', () => {
    it('saves a draft with nothing filled in', () => {
      const empty = { headcount: '', workDone: '', blockers: '', nextDayPlan: '' };
      const report = buildReport(SITE, DAY, fields(empty), 'draft', { previous: null });
      expect(report).toMatchObject({ status: 'draft', headcount: null, workDone: null });
    });

    it('refuses a submit with no headcount or no work done', () => {
      expect(code(() => submitted({ headcount: '' }))).toBe('headcount_required');
      expect(code(() => submitted({ workDone: ' \n ' }))).toBe('work_done_required');
    });

    it.each([['-1'], ['1001'], ['1.5'], ['12a'], ['abc'], ['99999999999']])(
      'refuses the headcount %p, on a draft too',
      (headcount) => {
        expect(code(() => buildReport(SITE, DAY, fields({ headcount }), 'draft', { previous: null }))).toBe(
          'headcount_invalid',
        );
      },
    );

    it('takes a headcount of 0 and of 1000, the edges the table allows', () => {
      expect(submitted({ headcount: '0' }).headcount).toBe(0);
      expect(submitted({ headcount: '1000' }).headcount).toBe(1000);
    });

    it('counts text the way char_length does, so one emoji is one character', () => {
      expect(charCount('👷')).toBe(1);
      expect(charCount('काम')).toBe(3);
      const atLimit = '👷'.repeat(REPORT_LIMITS.workDone);
      expect(submitted({ workDone: atLimit }).workDone).toBe(atLimit);
      expect(code(() => submitted({ workDone: `${atLimit}x` }))).toBe('work_done_too_long');
    });

    it.each([
      ['blockers', 'blockers_too_long', REPORT_LIMITS.blockers],
      ['nextDayPlan', 'plan_too_long', REPORT_LIMITS.nextDayPlan],
    ] as const)('refuses %s over its limit', (field, expected, limit) => {
      expect(() => submitted({ [field]: 'a'.repeat(limit) })).not.toThrow();
      expect(code(() => submitted({ [field]: 'a'.repeat(limit + 1) }))).toBe(expected);
    });

    it('refuses a serious blocker with no blocker text, on a draft too (the table has no status condition)', () => {
      const bad = fields({ seriousBlocker: true, blockers: ' ' });
      expect(code(() => buildReport(SITE, DAY, bad, 'draft', { previous: null }))).toBe('blocker_text_required');
      expect(code(() => buildReport(SITE, DAY, bad, 'submitted', { previous: null }))).toBe('blocker_text_required');
    });

    it('refuses a site the phone holds with no organisation yet', () => {
      expect(code(() => buildReport({ id: SITE.id, orgId: null }, DAY, fields(), 'draft', { previous: null }))).toBe(
        'no_org',
      );
    });

    it('refuses a date that is not a calendar day', () => {
      expect(code(() => buildReport(SITE, '2026-02-30', fields(), 'draft', { previous: null }))).toBe('bad_date');
      expect(code(() => buildReport(SITE, '20/10/2026', fields(), 'draft', { previous: null }))).toBe('bad_date');
    });
  });

  describe('an edit after submit (ADR-013 R6, D4)', () => {
    it('needs no reason before the report was submitted', () => {
      const draft = buildReport(SITE, DAY, fields(), 'draft', { previous: null });
      expect(needsReason(null)).toBe(false);
      expect(needsReason(draft)).toBe(false);
      expect(buildReport(SITE, DAY, fields(), 'submitted', { previous: draft }).editReason).toBeNull();
    });

    it('needs a reason once it was submitted, and sends it as edit_reason', () => {
      const first = submitted();
      expect(needsReason(first)).toBe(true);

      const changed = fields({ headcount: '14' });
      expect(code(() => buildReport(SITE, DAY, changed, 'submitted', { previous: first }))).toBe('reason_required');
      expect(code(() => buildReport(SITE, DAY, changed, 'submitted', { previous: first, reason: '  ' }))).toBe(
        'reason_required',
      );

      const edited = buildReport(SITE, DAY, changed, 'submitted', { previous: first, reason: ' Two came late ' });
      expect(buildPayload(edited)).toMatchObject({ headcount: 14, edit_reason: 'Two came late' });
    });

    it('refuses a reason over 500 characters', () => {
      const reason = 'r'.repeat(REPORT_LIMITS.reason + 1);
      expect(code(() => buildReport(SITE, DAY, fields({ headcount: '14' }), 'submitted', { previous: submitted(), reason }))).toBe(
        'reason_too_long',
      );
    });

    it('never takes a submitted report back to draft', () => {
      expect(code(() => buildReport(SITE, DAY, fields(), 'draft', { previous: submitted() }))).toBe('already_submitted');
    });

    it('sends a submitted report again unchanged, but only with a reason (ADR-042 D4, D7)', () => {
      // The phone cannot know a manager sent it back; a reason alone answers a send-back.
      const answer = buildReport(SITE, DAY, fields(), 'submitted', { previous: submitted(), reason: 'It was right' });
      expect(buildPayload(answer)).toMatchObject({ status: 'submitted', edit_reason: 'It was right' });
      expect(code(() => buildReport(SITE, DAY, fields(), 'submitted', { previous: submitted() }))).toBe('reason_required');
    });

    it('refuses a change to another site or day under the same report', () => {
      const other = { id: '51000000-0000-4000-8000-000000000002', orgId: ORG };
      expect(code(() => buildReport(other, DAY, fields(), 'draft', { previous: submitted() }))).toBe('different_report');
      expect(code(() => buildReport(SITE, '2026-10-19', fields(), 'draft', { previous: submitted() }))).toBe(
        'different_report',
      );
    });
  });

  describe('which day (D2)', () => {
    it('reports on the day asked for, up to today, and on today for anything else', () => {
      expect(reportDay('2026-10-18', DAY)).toBe('2026-10-18');
      expect(reportDay(DAY, DAY)).toBe(DAY);
      expect(reportDay('2026-10-21', DAY)).toBe(DAY);
      expect(reportDay('2026-02-30', DAY)).toBe(DAY);
      expect(reportDay('yesterday', DAY)).toBe(DAY);
      expect(reportDay(undefined, DAY)).toBe(DAY);
    });

    it('names a day the way the screens show it', () => {
      expect(dayLabel('2026-10-05')).toBe('5 Oct');
      expect(dayLabel('2026-01-31')).toBe('31 Jan');
    });
  });

  describe('flags and status in plain words (D5, D6)', () => {
    it('flags a serious blocker or a safety incident', () => {
      expect(isFlagged(fields())).toBe(false);
      expect(isFlagged(fields({ seriousBlocker: true }))).toBe(true);
      expect(isFlagged(fields({ safetyIncident: true }))).toBe(true);
    });

    it('says "Submitted" only for a submitted report the server accepted', () => {
      expect(reportStatusText('submitted', 'synced', null)).toEqual({ tone: 'ok', text: 'Submitted' });
      for (const waiting of ['pending', 'syncing', 'failed'] as const) {
        expect(reportStatusText('submitted', waiting, null).text).not.toMatch(/submitted/i);
        expect(reportStatusText('submitted', waiting, null).tone).toBe('wait');
      }
      expect(reportStatusText('draft', 'synced', null).text).not.toMatch(/submitted/i);
    });

    it.each([
      ['conflict', 'reviewed', /manager already reviewed/],
      ['conflict', 'sent_back', /sent this report back.*reason/],
      ['conflict', 'duplicate', /another report for this site and day/i],
      ['conflict', 'different_report', /different report/],
      ['rejected', 'invalid_input', /isn't valid/],
      ['rejected', 'invalid_state', /cannot go back to a draft/],
      ['rejected', 'permission_denied', /can't report on this site/],
    ] as const)('says what %s / %s means', (status, reason, text) => {
      const shown = reportStatusText('submitted', status, reason);
      expect(shown.tone).toBe('attention');
      expect(shown.text).toMatch(text);
    });

    it('never prints an unknown server code as anything but a short code', () => {
      expect(reportStatusText('submitted', 'rejected', 'server:XX000').text).toMatch(/Needs attention/);
    });

    it('has a fixed sentence for every error code', () => {
      for (const c of [
        'headcount_invalid',
        'headcount_required',
        'work_done_required',
        'work_done_too_long',
        'blockers_too_long',
        'plan_too_long',
        'blocker_text_required',
        'reason_required',
        'reason_too_long',
        'already_submitted',
        'different_report',
        'no_org',
        'bad_date',
        'reviewed',
        'not_found',
      ] as const) {
        expect(reportErrorText(new ReportError(c))).toMatch(/\w/);
      }
      expect(reportErrorText(new Error('/data/user/0/app.db is locked'))).toBe('Could not save on this phone. Try again.');
    });
  });
});

describe('headcount from the day’s attendance (#109, ADR-038)', () => {
  it('starts a new report with the number on site', () => {
    expect(openingFields(null, { onSite: 14, halfDay: 2 }).headcount).toBe('14');
  });

  it('starts at 0 when attendance was taken and nobody came', () => {
    expect(openingFields(null, { onSite: 0, halfDay: 0 }).headcount).toBe('0');
  });

  it('leaves the headcount to be typed when the phone holds no attendance', () => {
    expect(openingFields(null, null)).toEqual({
      headcount: '',
      workDone: '',
      blockers: '',
      seriousBlocker: false,
      safetyIncident: false,
      nextDayPlan: '',
    });
  });

  it('never overwrites a saved report’s headcount', () => {
    const saved = submitted({ headcount: '12' });
    expect(openingFields(saved, { onSite: 14, halfDay: 0 }).headcount).toBe('12');
  });

  it('keeps a saved report with no headcount empty', () => {
    const draft = buildReport(SITE, DAY, fields({ headcount: '' }), 'draft', { previous: null });
    expect(openingFields(draft, { onSite: 14, halfDay: 0 }).headcount).toBe('');
  });

  it('says where the number came from, and the half days only when there are some', () => {
    expect(headcountHint({ onSite: 14, halfDay: 2 })).toBe('From attendance on this phone: 14 on site (2 half day)');
    expect(headcountHint({ onSite: 9, halfDay: 0 })).toBe('From attendance on this phone: 9 on site');
  });

  it('opens a pre-filled form that a submit accepts as it is', () => {
    const r = buildReport(SITE, DAY, { ...openingFields(null, { onSite: 14, halfDay: 0 }), workDone: 'Slab' }, 'submitted', {
      previous: null,
    });
    expect(r.headcount).toBe(14);
  });
});

// #137: the phone shows a manager's send-back, with the note, from the mirror (ADR-051).
// Negative cases first.
describe('a report a manager sent back (#137)', () => {
  const SENT = '2026-10-20T12:00:00.000Z';
  const base = {
    report: { status: 'submitted' as const },
    status: 'synced' as const,
    reason: null,
    updatedAt: SENT,
    server: { status: 'rejected' as const, reviewNote: 'Add photos of the slab', reviewedAt: '2026-10-20T13:30:00.654321+00:00' },
  };

  it('is not sent back with no mirror row, or when the server holds it as submitted or reviewed', () => {
    expect(sentBackNote({ ...base, server: null })).toBeUndefined();
    expect(sentBackNote({ ...base, server: { ...base.server, status: 'submitted' } })).toBeUndefined();
    expect(sentBackNote({ ...base, server: { ...base.server, status: 'reviewed' } })).toBeUndefined();
  });

  it('is not sent back once the supervisor resubmitted after the review, or while the resubmit waits to send', () => {
    expect(sentBackNote({ ...base, updatedAt: '2026-10-20T14:00:00.000Z' })).toBeUndefined();
    expect(sentBackNote({ ...base, status: 'pending' })).toBeUndefined();
  });

  it('is not shown for a draft, or a review time it cannot read', () => {
    expect(sentBackNote({ ...base, report: { status: 'draft' } })).toBeUndefined();
    expect(sentBackNote({ ...base, server: { ...base.server, reviewedAt: null } })).toBeUndefined();
    expect(sentBackNote({ ...base, server: { ...base.server, reviewedAt: 'soon' } })).toBeUndefined();
  });

  it("gives the manager's note when the review came after the phone sent it", () => {
    expect(sentBackNote(base)).toBe('Add photos of the slab');
    expect(sentBackNote({ ...base, server: { ...base.server, reviewNote: null } })).toBeNull();
  });

  it("gives the note when the last push was answered sent_back, whatever the times", () => {
    expect(sentBackNote({ ...base, status: 'conflict', reason: 'sent_back', updatedAt: '2026-10-21T09:00:00.000Z' })).toBe(
      'Add photos of the slab',
    );
  });

  it('says "Sent back: <note>" instead of "Submitted", and never says Submitted for it', () => {
    expect(reportStatusText('submitted', 'synced', null, 'Add photos of the slab')).toEqual({
      tone: 'attention',
      text: 'Sent back: Add photos of the slab',
    });
    expect(reportStatusText('submitted', 'synced', null, null).text).toMatch(/^A manager sent this report back/);
    expect(reportStatusText('submitted', 'synced', null)).toEqual({ tone: 'ok', text: 'Submitted' });
  });

  it("puts the manager's note in place of the fixed sentence on a sent_back answer", () => {
    expect(reportStatusText('submitted', 'conflict', 'sent_back', 'Recount the cement').text).toBe(
      'Needs attention · Sent back: Recount the cement',
    );
    expect(reportStatusText('submitted', 'conflict', 'sent_back').text).toMatch(/^Needs attention · A manager sent this report back/);
  });

  it('shows on the card too, and only with the mirror view', () => {
    expect(reportCardStatus(base)).toEqual({ tone: 'attention', text: 'Sent back: Add photos of the slab' });
    expect(reportCardStatus({ report: { status: 'submitted' }, status: 'synced', reason: null })).toEqual({ tone: 'ok', text: 'Submitted' });
  });
});

import {
  buildCorrectionPayload,
  buildDayPayload,
  buildEntryPayload,
  cleanMark,
  entryStatusText,
  parseEntryPayload,
  RegisterError,
  type RegisterKey,
} from '../register';

const KEY: RegisterKey = {
  orgId: '0a0a0a0a-0000-4000-8000-0000000000a1',
  siteId: '51000000-0000-4000-8000-000000000001',
  date: '2026-10-20',
};
const WORKER = '77777777-0000-4000-8000-000000000001';

const raw = (over: Partial<{ status: string; overtime: string; note: string }> = {}) => ({
  status: 'present',
  overtime: '',
  note: '',
  ...over,
});

const code = (fn: () => unknown): string | null => {
  try {
    fn();
  } catch (e) {
    return e instanceof RegisterError ? e.code : 'other';
  }
  return null;
};

describe('cleanMark', () => {
  it('takes the four statuses and nothing else', () => {
    for (const s of ['present', 'absent', 'half_day', 'leave']) {
      expect(cleanMark(raw({ status: s })).status).toBe(s);
    }
    for (const s of ['', 'Present', 'sick', '__proto__', 'approved']) {
      expect(code(() => cleanMark(raw({ status: s })))).toBe('status');
    }
  });

  it('reads overtime as hours from 0 to 8 with up to two decimals; blank is 0', () => {
    expect(cleanMark(raw()).overtimeHours).toBe(0);
    expect(cleanMark(raw({ overtime: '  ' })).overtimeHours).toBe(0);
    expect(cleanMark(raw({ overtime: '0' })).overtimeHours).toBe(0);
    expect(cleanMark(raw({ overtime: '2.5' })).overtimeHours).toBe(2.5);
    expect(cleanMark(raw({ overtime: '2.25' })).overtimeHours).toBe(2.25);
    expect(cleanMark(raw({ overtime: '8' })).overtimeHours).toBe(8);
    expect(cleanMark(raw({ status: 'half_day', overtime: '1' })).overtimeHours).toBe(1);
  });

  it('refuses overtime that is out of range, has too many decimals, or is not a plain number', () => {
    for (const bad of ['8.01', '9', '-1', '2.555', '1e1', 'NaN', '0x2', '2,5', 'two', '2h', '.5.', '1 2']) {
      expect(code(() => cleanMark(raw({ overtime: bad })))).toBe('overtime');
    }
  });

  it('refuses overtime on an absent or leave day, as the table does', () => {
    expect(code(() => cleanMark(raw({ status: 'absent', overtime: '1' })))).toBe('overtime_needs_work');
    expect(code(() => cleanMark(raw({ status: 'leave', overtime: '0.5' })))).toBe('overtime_needs_work');
    expect(cleanMark(raw({ status: 'absent', overtime: '0' })).overtimeHours).toBe(0);
  });

  it('trims the note, turns a blank one into null, and keeps at most 500 characters', () => {
    expect(cleanMark(raw({ note: '  late start  ' })).note).toBe('late start');
    expect(cleanMark(raw({ note: '   ' })).note).toBeNull();
    expect(cleanMark(raw({ note: 'x'.repeat(500) })).note).toHaveLength(500);
    expect(code(() => cleanMark(raw({ note: 'x'.repeat(501) })))).toBe('note');
  });

  it('counts a note in characters, as the database does, not in UTF-16 units', () => {
    expect(cleanMark(raw({ note: '😀'.repeat(500) })).note).toHaveLength(1000);
    expect(code(() => cleanMark(raw({ note: '😀'.repeat(501) })))).toBe('note');
  });
});

describe('payloads', () => {
  it('builds the day exactly as sync_attendance_days reads it', () => {
    expect(buildDayPayload(KEY)).toEqual({
      org_id: KEY.orgId,
      site_id: KEY.siteId,
      attendance_date: KEY.date,
    });
  });

  it('builds an entry exactly as sync_attendance_entries reads it, every key always there', () => {
    const mark = cleanMark(raw({ status: 'half_day', overtime: '1.5', note: 'rain' }));
    expect(buildEntryPayload(KEY, WORKER, mark)).toEqual({
      org_id: KEY.orgId,
      site_id: KEY.siteId,
      attendance_date: KEY.date,
      worker_id: WORKER,
      status: 'half_day',
      overtime_hours: 1.5,
      note: 'rain',
    });
    expect(buildEntryPayload(KEY, WORKER, cleanMark(raw())).note).toBeNull();
  });

  it('builds a correction with the new values and a reason, and never the old values', () => {
    const mark = cleanMark(raw({ status: 'absent' }));
    const payload = buildCorrectionPayload(KEY, WORKER, mark, '  worker was on leave  ');
    expect(payload).toEqual({
      org_id: KEY.orgId,
      site_id: KEY.siteId,
      attendance_date: KEY.date,
      worker_id: WORKER,
      new_status: 'absent',
      new_overtime_hours: 0,
      new_note: null,
      reason: 'worker was on leave',
    });
    expect(Object.keys(payload).some((k) => k.startsWith('old_'))).toBe(false);
  });

  it('refuses a correction with no reason or a reason over 500 characters', () => {
    const mark = cleanMark(raw());
    expect(code(() => buildCorrectionPayload(KEY, WORKER, mark, ''))).toBe('reason_required');
    expect(code(() => buildCorrectionPayload(KEY, WORKER, mark, '   '))).toBe('reason_required');
    expect(code(() => buildCorrectionPayload(KEY, WORKER, mark, 'x'.repeat(501)))).toBe('reason_too_long');
    expect(buildCorrectionPayload(KEY, WORKER, mark, 'x'.repeat(500)).reason).toHaveLength(500);
  });
});

describe('parseEntryPayload', () => {
  it('reads back what buildEntryPayload wrote', () => {
    const mark = cleanMark(raw({ status: 'present', overtime: '2', note: 'n' }));
    expect(parseEntryPayload(buildEntryPayload(KEY, WORKER, mark))).toEqual({ key: KEY, workerId: WORKER, mark });
  });

  it('returns null for anything that is not an entry', () => {
    const good = buildEntryPayload(KEY, WORKER, cleanMark(raw()));
    for (const bad of [
      null,
      'x',
      [],
      {},
      { ...good, status: 'sick' },
      { ...good, overtime_hours: '2' },
      { ...good, overtime_hours: 9 },
      { ...good, note: 5 },
      { ...good, attendance_date: 'today' },
      { ...good, worker_id: undefined },
    ]) {
      expect(parseEntryPayload(bad)).toBeNull();
    }
  });
});

describe('entryStatusText', () => {
  it('says "waiting to send" for anything not yet accepted and never "submitted" or "sent"', () => {
    for (const status of ['pending', 'syncing', 'failed'] as const) {
      const { text } = entryStatusText(status, null);
      expect(text).not.toMatch(/submitted|sent\b/i);
      expect(text).not.toMatch(/on the server/i);
    }
    expect(entryStatusText('pending', null).text).toBe('Saved on this phone, waiting to send');
    expect(entryStatusText('failed', null).text).toBe('Could not send yet. Will retry.');
  });

  it('says "On the server" only for a synced entry', () => {
    expect(entryStatusText('synced', null)).toEqual({ tone: 'ok', text: 'On the server' });
  });

  it('says "Needs attention" for a conflict or a refusal, with the reason in plain words', () => {
    expect(entryStatusText('conflict', 'locked')).toEqual({
      tone: 'attention',
      text: 'Needs attention · A manager already approved this day, so this change was not applied. Propose a correction instead.',
    });
    const dup = entryStatusText('conflict', 'duplicate');
    expect(dup.tone).toBe('attention');
    expect(dup.text).toMatch(/^Needs attention · /);
    expect(entryStatusText('rejected', 'permission_denied').text).toMatch(/can't record on this site/i);
    expect(entryStatusText('rejected', 'invalid_input').text).toMatch(/^Needs attention · /);
  });

  it('never prints a raw code or error text it does not know', () => {
    for (const reason of ['PT500: secret table x', 'server:XX000', null]) {
      const { text } = entryStatusText('rejected', reason);
      expect(text).toMatch(/^Needs attention · /);
      expect(text).not.toContain('PT500');
      expect(text).not.toContain('XX000');
      expect(text).not.toContain('secret');
    }
  });
});

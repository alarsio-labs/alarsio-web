import { monthDates, shiftMonth, summariseMonth, whyNotMarkable } from '../month';

describe('monthDates', () => {
  it('lists every day of the month', () => {
    const days = monthDates('2026-11');
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-11-01');
    expect(days[29]).toBe('2026-11-30');
  });

  it('knows a leap February', () => {
    expect(monthDates('2028-02')).toHaveLength(29);
    expect(monthDates('2026-02')).toHaveLength(28);
  });
});

describe('shiftMonth', () => {
  it('crosses a year', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('summariseMonth', () => {
  const dates = monthDates('2026-11');

  it('counts present as 1, half day as 0.5, leave and absent as 0 (wage_compute_days)', () => {
    const marks = new Map([
      ['2026-11-01', { status: 'present' as const, overtimeHours: 0 }],
      ['2026-11-02', { status: 'present' as const, overtimeHours: 2.5 }],
      ['2026-11-03', { status: 'half_day' as const, overtimeHours: 1 }],
      ['2026-11-04', { status: 'leave' as const, overtimeHours: 0 }],
      ['2026-11-05', { status: 'absent' as const, overtimeHours: 0 }],
    ]);
    expect(summariseMonth(dates, marks)).toEqual({
      present: 2,
      halfDays: 1,
      leave: 1,
      absent: 1,
      notMarked: 25,
      payableDays: 2.5,
      overtimeHours: 3.5,
    });
  });

  it('shows days with no entry as not marked, never as absent', () => {
    const s = summariseMonth(dates, new Map());
    expect(s.absent).toBe(0);
    expect(s.notMarked).toBe(30);
    expect(s.payableDays).toBe(0);
  });

  it('adds overtime without float drift', () => {
    const marks = new Map([
      ['2026-11-01', { status: 'present' as const, overtimeHours: 0.1 }],
      ['2026-11-02', { status: 'present' as const, overtimeHours: 0.2 }],
    ]);
    expect(summariseMonth(dates, marks).overtimeHours).toBe(0.3);
  });

  it('ignores a mark outside the listed dates', () => {
    const marks = new Map([['2026-10-31', { status: 'present' as const, overtimeHours: 0 }]]);
    expect(summariseMonth(dates, marks).present).toBe(0);
  });
});

describe('whyNotMarkable', () => {
  const today = '2026-11-19';
  const w = { assignedOn: '2026-11-05', unassignedOn: null as string | null };

  it('allows today and tomorrow, the server takes nothing after tomorrow', () => {
    expect(whyNotMarkable('2026-11-19', today, w)).toBeNull();
    expect(whyNotMarkable('2026-11-20', today, w)).toBeNull();
    expect(whyNotMarkable('2026-11-21', today, w)).toBe('future');
  });

  it('refuses days before the assignment began', () => {
    expect(whyNotMarkable('2026-11-04', today, w)).toBe('not_assigned');
    expect(whyNotMarkable('2026-11-05', today, w)).toBeNull();
  });

  it('refuses days after the assignment ended, but allows the last day', () => {
    const left = { assignedOn: '2026-11-01', unassignedOn: '2026-11-10' };
    expect(whyNotMarkable('2026-11-10', today, left)).toBeNull();
    expect(whyNotMarkable('2026-11-11', today, left)).toBe('not_assigned');
  });
});

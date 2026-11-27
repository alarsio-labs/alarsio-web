import {
  AdvanceError,
  advanceErrorText,
  advanceStatusText,
  AMOUNT_MAX_PAISE,
  buildAdvance,
  buildPayload,
  formatRupees,
  NOTE_MAX,
  parseAmount,
  parsePayload,
  type AdvanceErrorCode,
} from '../advance';

const WORKER = '33333333-0000-4000-8000-000000000001';
const SITE = '51000000-0000-4000-8000-000000000001';
const TODAY = '2026-11-27';

const input = (over: Partial<Parameters<typeof buildAdvance>[0]> = {}) => ({
  workerId: WORKER,
  amount: '500',
  note: '',
  paidOn: TODAY,
  ...over,
});

const codeOf = (fn: () => unknown): AdvanceErrorCode | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof AdvanceError ? e.code : undefined;
  }
  return undefined;
};

describe('parseAmount', () => {
  it.each([
    ['500', 50000],
    ['500.5', 50050],
    ['500.50', 50050],
    ['0.01', 1],
    [' 1200 ', 120000],
    ['1000000', AMOUNT_MAX_PAISE],
    ['0.1', 10],
  ])('reads %s as %i paise', (text, paise) => {
    expect(parseAmount(text)).toEqual({ ok: true, paise });
  });

  it('does not let 0.1 + 0.2 style rounding in', () => {
    expect(parseAmount('0.30')).toEqual({ ok: true, paise: 30 });
    expect(parseAmount('19.99')).toEqual({ ok: true, paise: 1999 });
  });

  it.each([
    ['', 'amount_required'],
    ['   ', 'amount_required'],
    ['abc', 'amount_invalid'],
    ['1.234', 'amount_invalid'],
    ['-5', 'amount_invalid'],
    ['1e3', 'amount_invalid'],
    ['1,500', 'amount_invalid'],
    ['.5', 'amount_invalid'],
    ['0', 'amount_zero'],
    ['0.00', 'amount_zero'],
    ['1000000.01', 'amount_too_large'],
    ['99999999999', 'amount_too_large'],
  ] as const)('refuses "%s" with %s', (text, code) => {
    expect(parseAmount(text)).toEqual({ ok: false, code });
  });
});

describe('buildAdvance', () => {
  it('builds an advance with the amount in paise and no note', () => {
    expect(buildAdvance(input(), TODAY)).toEqual({ workerId: WORKER, paidOn: TODAY, amountPaise: 50000, note: null });
  });

  it('trims the note, and keeps one made only of spaces as no note', () => {
    expect(buildAdvance(input({ note: '  for rent  ' }), TODAY).note).toBe('for rent');
    expect(buildAdvance(input({ note: '   ' }), TODAY).note).toBeNull();
  });

  it('accepts today and an earlier day', () => {
    expect(codeOf(() => buildAdvance(input({ paidOn: TODAY }), TODAY))).toBeUndefined();
    expect(codeOf(() => buildAdvance(input({ paidOn: '2026-01-31' }), TODAY))).toBeUndefined();
  });

  it('refuses a later day, and a day that does not exist', () => {
    expect(codeOf(() => buildAdvance(input({ paidOn: '2026-11-28' }), TODAY))).toBe('date_future');
    expect(codeOf(() => buildAdvance(input({ paidOn: '2026-02-30' }), TODAY))).toBe('date_invalid');
    expect(codeOf(() => buildAdvance(input({ paidOn: 'today' }), TODAY))).toBe('date_invalid');
  });

  it('counts the note in characters, as the database does', () => {
    expect(codeOf(() => buildAdvance(input({ note: 'x'.repeat(NOTE_MAX) }), TODAY))).toBeUndefined();
    expect(codeOf(() => buildAdvance(input({ note: 'x'.repeat(NOTE_MAX + 1) }), TODAY))).toBe('note_too_long');
    expect(codeOf(() => buildAdvance(input({ note: '😀'.repeat(NOTE_MAX) }), TODAY))).toBeUndefined();
  });

  it('passes an amount error on', () => {
    expect(codeOf(() => buildAdvance(input({ amount: '' }), TODAY))).toBe('amount_required');
  });
});

describe('payload', () => {
  const stored = { siteId: SITE, workerId: WORKER, paidOn: TODAY, amountPaise: 50000, note: 'rent', reversesId: null };

  it('builds the payload the handler reads, with null for a missing note and reverses_id', () => {
    expect(buildPayload({ ...stored, note: null })).toEqual({
      site_id: SITE,
      worker_id: WORKER,
      paid_on: TODAY,
      amount_paise: 50000,
      note: null,
      reverses_id: null,
    });
  });

  it('reads back what it built', () => {
    expect(parsePayload(buildPayload(stored))).toEqual(stored);
    const reversal = { ...stored, reversesId: '44444444-0000-4000-8000-000000000001' };
    expect(parsePayload(buildPayload(reversal))).toEqual(reversal);
  });

  it('is null for anything that is not an advance', () => {
    const ok = buildPayload(stored);
    const bad: Record<string, unknown>[] = [
      {},
      { ...ok, site_id: '' },
      { ...ok, worker_id: 5 },
      { ...ok, paid_on: '2026-02-30' },
      { ...ok, amount_paise: 0 },
      { ...ok, amount_paise: 12.5 },
      { ...ok, amount_paise: '500' },
      { ...ok, amount_paise: AMOUNT_MAX_PAISE + 1 },
      { ...ok, note: 7 },
      { ...ok, reverses_id: '' },
    ];
    for (const payload of bad) expect(parsePayload(payload)).toBeNull();
  });
});

describe('formatRupees', () => {
  it.each([
    [0, '₹0'],
    [50, '₹0.50'],
    [50000, '₹500'],
    [123400, '₹1,234'],
    [123456700, '₹12,34,567'],
    [100000000, '₹10,00,000'],
    [50050, '₹500.50'],
    [5, '₹0.05'],
  ])('%i paise is %s', (paise, text) => {
    expect(formatRupees(paise)).toBe(text);
  });
});

describe('texts', () => {
  it('has a sentence for every error code', () => {
    const codes: AdvanceErrorCode[] = [
      'amount_required', 'amount_invalid', 'amount_zero', 'amount_too_large', 'note_too_long',
      'date_invalid', 'date_future', 'worker_not_found', 'advance_not_found', 'already_cancelled',
    ];
    for (const code of codes) expect(advanceErrorText(code)).not.toContain('siteAdvances');
    expect(advanceErrorText('note_too_long')).toContain(String(NOTE_MAX));
  });

  it('says "on the server" only for a synced record', () => {
    expect(advanceStatusText('pending', null).tone).toBe('wait');
    expect(advanceStatusText('syncing', null).tone).toBe('wait');
    expect(advanceStatusText('failed', null).tone).toBe('wait');
    expect(advanceStatusText('synced', null)).toEqual({ tone: 'ok', text: 'On the server' });
    expect(advanceStatusText('rejected', 'permission_denied')).toEqual({
      tone: 'attention',
      text: "Needs attention · You can't record on this site any more.",
    });
    expect(advanceStatusText('conflict', 'duplicate').tone).toBe('attention');
  });
});

import { NOTE_MAX } from '../../advances/advance';
import {
  buildEntry,
  buildPayload,
  cashBalance,
  cashErrorText,
  isCashIn,
  isWaiting,
  parsePayload,
  type CashErrorCode,
  type CashLine,
} from '../cash';

const SITE = '51000000-0000-4000-8000-000000000001';
const TODAY = '2026-11-27';

const input = (over: Partial<Parameters<typeof buildEntry>[0]> = {}) => ({
  category: 'wages',
  amount: '500',
  note: '',
  entryDate: TODAY,
  ...over,
});

const codeOf = (fn: () => unknown): CashErrorCode | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: CashErrorCode }).code;
  }
  return undefined;
};

describe('buildEntry', () => {
  it('turns rupees into whole paise and trims the note', () => {
    expect(buildEntry(input({ amount: '1234.5', note: '  tea  ' }), TODAY)).toEqual({
      entryDate: TODAY,
      category: 'wages',
      amountPaise: 123450,
      note: 'tea',
    });
  });

  it('keeps no note when it is blank', () => {
    expect(buildEntry(input({ note: '   ' }), TODAY).note).toBeNull();
  });

  it('refuses what the server would refuse', () => {
    const bad: [Partial<Parameters<typeof buildEntry>[0]>, CashErrorCode][] = [
      [{ category: 'gift' }, 'category_invalid'],
      [{ amount: '' }, 'amount_required'],
      [{ amount: '1.234' }, 'amount_invalid'],
      [{ amount: '0' }, 'amount_zero'],
      [{ amount: '1000000.01' }, 'amount_too_large'],
      [{ entryDate: 'soon' }, 'date_invalid'],
      [{ entryDate: '2026-11-28' }, 'date_future'],
      [{ note: 'x'.repeat(NOTE_MAX + 1) }, 'note_too_long'],
    ];
    for (const [over, code] of bad) expect(codeOf(() => buildEntry(input(over), TODAY))).toBe(code);
  });

  it('counts the note in characters, not UTF-16 units', () => {
    expect(codeOf(() => buildEntry(input({ note: '😀'.repeat(NOTE_MAX) }), TODAY))).toBeUndefined();
  });

  it('has a sentence for every error code', () => {
    const codes: CashErrorCode[] = [
      'amount_required', 'amount_invalid', 'amount_zero', 'amount_too_large', 'category_invalid',
      'note_too_long', 'date_invalid', 'date_future', 'entry_not_found', 'already_cancelled',
    ];
    for (const code of codes) expect(cashErrorText(code)).not.toContain('siteCash.error');
  });
});

describe('payload', () => {
  const stored = { siteId: SITE, entryDate: TODAY, category: 'food' as const, amountPaise: 2500, note: 'lunch', reversesId: null };

  it('holds exactly the keys sync_cash_entries reads, and reads them back', () => {
    const payload = buildPayload(stored);
    expect(payload).toEqual({
      site_id: SITE,
      entry_date: TODAY,
      category: 'food',
      amount_paise: 2500,
      note: 'lunch',
      reverses_id: null,
    });
    expect(parsePayload(payload)).toEqual(stored);
  });

  it('reads nothing from a payload that is not an entry', () => {
    const good = buildPayload(stored);
    const bad: Record<string, unknown>[] = [
      {},
      { ...good, site_id: '' },
      { ...good, category: 'gift' },
      { ...good, entry_date: '2026-02-30' },
      { ...good, amount_paise: 12.5 },
      { ...good, amount_paise: 0 },
      { ...good, amount_paise: 100_000_001 },
      { ...good, note: 5 },
      { ...good, reverses_id: 7 },
    ];
    for (const payload of bad) expect(parsePayload(payload)).toBeNull();
  });
});

describe('cashBalance', () => {
  let n = 0;
  const line = (over: Partial<CashLine> = {}): CashLine => ({
    recordId: `r-${(n += 1)}`,
    source: 'cash',
    entryDate: '2026-11-10',
    category: 'wages',
    amountPaise: 10000,
    note: null,
    reversesId: null,
    status: 'synced',
    reason: null,
    workerName: '',
    cancelled: false,
    canCancel: false,
    ...over,
  });
  const month = '2026-11';

  it('is zero with no lines', () => {
    expect(cashBalance([], month)).toEqual({ inPaise: 0, outPaise: 0, advancesPaise: 0, boxPaise: 0 });
  });

  it('adds only "received" as cash in, and takes out the rest and the advances', () => {
    const balance = cashBalance(
      [
        line({ category: 'received', amountPaise: 100000 }),
        line({ category: 'wages', amountPaise: 30000 }),
        line({ category: 'food', amountPaise: 5000 }),
        line({ source: 'advance', category: null, amountPaise: 20000 }),
      ],
      month,
    );
    expect(balance).toEqual({ inPaise: 100000, outPaise: 35000, advancesPaise: 20000, boxPaise: 45000 });
  });

  it('lets a cancellation take its entry back out, from the same side', () => {
    const balance = cashBalance(
      [line({ category: 'received', amountPaise: 50000 }), line({ category: 'received', amountPaise: 50000, reversesId: 'x' })],
      month,
    );
    expect(balance.inPaise).toBe(0);
  });

  it('does not count an advance that was cancelled', () => {
    expect(cashBalance([line({ source: 'advance', category: null, cancelled: true })], month).advancesPaise).toBe(0);
  });

  it('does not count a record the server refused', () => {
    const lines = [line({ status: 'rejected' }), line({ status: 'conflict' }), line({ status: 'pending' })];
    expect(cashBalance(lines, month).outPaise).toBe(10000);
  });

  it('counts only the month asked for', () => {
    expect(cashBalance([line({ entryDate: '2026-10-31' }), line({ entryDate: '2026-11-01' })], month).outPaise).toBe(10000);
  });

  it('can go below zero', () => {
    expect(cashBalance([line({ amountPaise: 700 })], month).boxPaise).toBe(-700);
  });
});

describe('small helpers', () => {
  it('knows only "received" is cash in', () => {
    expect(isCashIn('received')).toBe(true);
    expect(isCashIn('other')).toBe(false);
  });

  it('calls a record waiting until the server confirms it', () => {
    const waiting = (status: CashLine['status']) => isWaiting({ status } as CashLine);
    expect(['pending', 'syncing', 'failed'].every((s) => waiting(s as CashLine['status']))).toBe(true);
    expect(['synced', 'rejected', 'conflict'].some((s) => waiting(s as CashLine['status']))).toBe(false);
  });
});

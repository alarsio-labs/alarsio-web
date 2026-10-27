import {
  buildMovement,
  buildPayload,
  formatMilli,
  MovementError,
  movementStatusText,
  MOVEMENT_MESSAGES,
  parsePayload,
  parseQuantity,
  signedMilli,
  stockState,
  type Movement,
} from '../movement';

const MATERIAL = '0a0a0a0a-0000-4000-8000-0000000000a1';
const TODAY = '2026-10-20';

const input = (over: Partial<Parameters<typeof buildMovement>[0]> = {}) => ({
  materialId: MATERIAL,
  kind: 'receipt' as const,
  quantity: '12.5',
  reason: '',
  occurredOn: TODAY,
  ...over,
});

describe('parseQuantity (exact thousandths, never through a float)', () => {
  it('reads a positive amount into integer thousandths', () => {
    expect(parseQuantity('12.5', 'receipt')).toEqual({ ok: true, milli: 12500 });
    expect(parseQuantity('0.001', 'usage')).toEqual({ ok: true, milli: 1 });
    expect(parseQuantity('12.345', 'opening')).toEqual({ ok: true, milli: 12345 });
    expect(parseQuantity('  40 ', 'opening')).toEqual({ ok: true, milli: 40000 });
    expect(parseQuantity('+7', 'receipt')).toEqual({ ok: true, milli: 7000 });
    expect(parseQuantity('999999999.999', 'receipt')).toEqual({ ok: true, milli: 999_999_999_999 });
  });

  it('is exact where a float is not', () => {
    // 0.1 + 0.2 and 1.005 * 1000 are the classic traps for number parsing.
    expect(parseQuantity('0.3', 'receipt')).toEqual({ ok: true, milli: 300 });
    expect(parseQuantity('1.005', 'receipt')).toEqual({ ok: true, milli: 1005 });
    expect(parseQuantity('4.35', 'receipt')).toEqual({ ok: true, milli: 4350 });
  });

  it('lets only an adjustment be negative, and says so for the other kinds', () => {
    expect(parseQuantity('-3.5', 'adjustment')).toEqual({ ok: true, milli: -3500 });
    expect(parseQuantity('3.5', 'adjustment')).toEqual({ ok: true, milli: 3500 });
    for (const kind of ['opening', 'receipt', 'usage'] as const) {
      expect(parseQuantity('-1', kind)).toEqual({ ok: false, code: 'quantity_negative' });
    }
  });

  it('refuses zero for every kind, since an adjustment of zero is nothing', () => {
    for (const kind of ['opening', 'receipt', 'usage', 'adjustment'] as const) {
      for (const text of ['0', '0.000', '-0', '+0.0']) {
        expect(parseQuantity(text, kind)).toEqual({ ok: false, code: 'quantity_zero' });
      }
    }
  });

  it('refuses blank, malformed and over-precise input', () => {
    expect(parseQuantity('', 'receipt')).toEqual({ ok: false, code: 'quantity_required' });
    expect(parseQuantity('   ', 'receipt')).toEqual({ ok: false, code: 'quantity_required' });
    for (const text of ['abc', '1,5', '1e3', '1.2345', '.5', '5.', '1 2', '0x10', 'NaN', 'Infinity', '--1', '5 bags']) {
      expect(parseQuantity(text, 'receipt')).toEqual({ ok: false, code: 'quantity_invalid' });
    }
  });

  it('refuses a quantity larger than numeric(12,3) holds', () => {
    expect(parseQuantity('1000000000', 'receipt')).toEqual({ ok: false, code: 'quantity_too_large' });
    expect(parseQuantity('-1000000000', 'adjustment')).toEqual({ ok: false, code: 'quantity_too_large' });
  });
});

describe('buildMovement', () => {
  it('builds a receipt with no reason', () => {
    expect(buildMovement(input(), TODAY)).toEqual({
      materialId: MATERIAL,
      kind: 'receipt',
      quantityMilli: 12500,
      occurredOn: TODAY,
      reason: null,
    });
  });

  it('keeps an optional reason on any kind, trimmed, and drops a blank one', () => {
    expect(buildMovement(input({ reason: '  truck 4  ' }), TODAY).reason).toBe('truck 4');
    expect(buildMovement(input({ reason: '   ' }), TODAY).reason).toBeNull();
  });

  it('demands a reason for an adjustment, at most 500 characters, counted as characters', () => {
    const adj = (reason: string) => () => buildMovement(input({ kind: 'adjustment', quantity: '-2', reason }), TODAY);
    expect(adj('')).toThrow(MovementError);
    expect(adj('   ')).toThrow(expect.objectContaining({ code: 'reason_required' }));
    expect(adj('x'.repeat(501))).toThrow(expect.objectContaining({ code: 'reason_too_long' }));
    expect(adj('x'.repeat(500))).not.toThrow();
    // 500 characters of two UTF-16 units each: still within the database's char_length.
    expect(adj('\u{1F9F1}'.repeat(500))).not.toThrow();
    expect(() => buildMovement(input({ reason: 'x'.repeat(501) }), TODAY)).toThrow(
      expect.objectContaining({ code: 'reason_too_long' }),
    );
  });

  it('accepts today and earlier days, and refuses a day in the future or one that is not a date', () => {
    expect(buildMovement(input({ occurredOn: '2026-10-19' }), TODAY).occurredOn).toBe('2026-10-19');
    expect(() => buildMovement(input({ occurredOn: '2026-10-21' }), TODAY)).toThrow(
      expect.objectContaining({ code: 'date_future' }),
    );
    for (const bad of ['', '20-10-2026', '2026-13-01', '2026-02-30', '2026-10-2', 'yesterday']) {
      expect(() => buildMovement(input({ occurredOn: bad }), TODAY)).toThrow(expect.objectContaining({ code: 'date_invalid' }));
    }
  });

  it('refuses a bad quantity with that quantity\'s own code, and an unknown kind', () => {
    expect(() => buildMovement(input({ quantity: '' }), TODAY)).toThrow(expect.objectContaining({ code: 'quantity_required' }));
    expect(() => buildMovement(input({ kind: 'sale' as never }), TODAY)).toThrow(expect.objectContaining({ code: 'kind_invalid' }));
  });

  it('has a fixed sentence for every error code, so no raw error reaches the screen', () => {
    for (const code of Object.keys(MOVEMENT_MESSAGES)) {
      expect(MOVEMENT_MESSAGES[code as keyof typeof MOVEMENT_MESSAGES].length).toBeGreaterThan(10);
    }
  });
});

describe('the payload sync_material_transactions reads', () => {
  const m = (over: Partial<Movement> = {}): Movement => ({
    materialId: MATERIAL,
    kind: 'usage',
    quantityMilli: 12345,
    occurredOn: TODAY,
    reason: null,
    ...over,
  });

  it('is exactly material_id, kind, quantity and occurred_on, with the quantity as a decimal number', () => {
    expect(buildPayload(m())).toEqual({ material_id: MATERIAL, kind: 'usage', quantity: 12.345, occurred_on: TODAY });
    expect(JSON.stringify(buildPayload(m({ quantityMilli: 1 })))).toContain('"quantity":0.001');
    expect(JSON.stringify(buildPayload(m({ quantityMilli: 999_999_999_999 })))).toContain('"quantity":999999999.999');
  });

  it('adds reason only when there is one, and a signed quantity for an adjustment', () => {
    expect(buildPayload(m({ reason: 'two bags torn' }))).toHaveProperty('reason', 'two bags torn');
    expect(buildPayload(m())).not.toHaveProperty('reason');
    expect(buildPayload(m({ kind: 'adjustment', quantityMilli: -2000, reason: 'lost' }))).toMatchObject({
      kind: 'adjustment',
      quantity: -2,
      reason: 'lost',
    });
  });

  it('round-trips through parsePayload without a float error', () => {
    for (const quantityMilli of [1, 300, 1005, 4350, 12345, 999_999_999_999, -1, -12345]) {
      const kind = quantityMilli < 0 ? 'adjustment' : 'receipt';
      const move = m({ kind, quantityMilli, reason: kind === 'adjustment' ? 'found' : null });
      expect(parsePayload(JSON.parse(JSON.stringify(buildPayload(move))))).toEqual(move);
    }
  });

  it('refuses a payload that is not a movement, instead of guessing', () => {
    const good = buildPayload(m());
    expect(parsePayload(good)).not.toBeNull();
    for (const bad of [
      { ...good, material_id: 5 },
      { ...good, kind: 'sale' },
      { ...good, quantity: '12.345' },
      { ...good, quantity: 12.3456 },
      { ...good, quantity: Number.NaN },
      { ...good, occurred_on: 'today' },
      { ...good, reason: 7 },
      { kind: 'usage' },
      {},
    ]) {
      expect(parsePayload(bad as never)).toBeNull();
    }
  });
});

describe('signedMilli and stockState', () => {
  it('subtracts usage, adds the rest, and keeps an adjustment\'s own sign', () => {
    const at = (kind: Movement['kind'], quantityMilli: number): Movement => ({
      materialId: MATERIAL, kind, quantityMilli, occurredOn: TODAY, reason: kind === 'adjustment' ? 'r' : null,
    });
    expect(signedMilli(at('opening', 40000))).toBe(40000);
    expect(signedMilli(at('receipt', 5000))).toBe(5000);
    expect(signedMilli(at('usage', 12500))).toBe(-12500);
    expect(signedMilli(at('adjustment', -2000))).toBe(-2000);
    expect(signedMilli(at('adjustment', 2000))).toBe(2000);
  });

  it('warns below zero, and at or under the threshold, the rule of the material_alerts view', () => {
    expect(stockState(-1, null)).toBe('negative');
    expect(stockState(-5000, 10000)).toBe('negative');
    expect(stockState(10000, 10000)).toBe('low');
    expect(stockState(9999, 10000)).toBe('low');
    expect(stockState(10001, 10000)).toBe('ok');
    expect(stockState(0, 0)).toBe('low');
    expect(stockState(0, null)).toBe('ok');
    expect(stockState(5000, null)).toBe('ok');
  });
});

describe('formatMilli', () => {
  it('shows up to three decimals, trimmed, with a minus for a negative', () => {
    expect(formatMilli(27500)).toBe('27.5');
    expect(formatMilli(1)).toBe('0.001');
    expect(formatMilli(-12345)).toBe('-12.345');
    expect(formatMilli(0)).toBe('0');
    expect(formatMilli(40000)).toBe('40');
    expect(formatMilli(1234567500)).toBe('1,234,567.5');
  });
});

describe('movementStatusText: "On the server" only once the server accepted it', () => {
  it('says saved and waiting for pending and syncing, and retry for failed', () => {
    expect(movementStatusText('pending', null)).toEqual({ tone: 'wait', text: 'Saved on this phone, waiting to send' });
    expect(movementStatusText('syncing', null).text).toBe('Saved on this phone, waiting to send');
    expect(movementStatusText('failed', 'network')).toEqual({ tone: 'wait', text: 'Could not send yet. Will retry.' });
  });

  it('says on the server for synced, and needs attention with the plain reason for the others', () => {
    expect(movementStatusText('synced', null)).toEqual({ tone: 'ok', text: 'On the server' });
    expect(movementStatusText('rejected', 'permission_denied')).toEqual({
      tone: 'attention',
      text: "Needs attention · You can't record on this site any more.",
    });
    expect(movementStatusText('conflict', 'duplicate').tone).toBe('attention');
  });

  it('never says submitted, whatever the status', () => {
    for (const status of ['pending', 'syncing', 'synced', 'failed', 'conflict', 'rejected'] as const) {
      expect(movementStatusText(status, null).text.toLowerCase()).not.toContain('submitted');
    }
  });
});

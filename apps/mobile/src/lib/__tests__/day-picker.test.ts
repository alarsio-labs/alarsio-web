import { dayToPickerDate, pickerDateToDay, pickerDayLabel } from '../day-picker';

describe('day picker helpers', () => {
  it('round-trips a day through the picker date', () => {
    expect(pickerDateToDay(dayToPickerDate('2026-11-06'))).toBe('2026-11-06');
    expect(pickerDateToDay(dayToPickerDate('2026-01-01'))).toBe('2026-01-01');
  });

  it('reads the day the picker shows, not a UTC instant', () => {
    expect(pickerDateToDay(new Date(2026, 9, 18, 0, 5))).toBe('2026-10-18');
    expect(pickerDateToDay(new Date(2026, 9, 18, 23, 55))).toBe('2026-10-18');
  });

  it('labels a day with its weekday', () => {
    expect(pickerDayLabel('2026-11-06')).toBe('Fri 6 Nov');
    expect(pickerDayLabel('2026-10-20')).toBe('Tue 20 Oct');
  });
});

// Dates for the native date picker. A day is "YYYY-MM-DD" (the IST day the
// record is for); the picker works with Dates in the phone's own timezone, so
// we read and write its year, month and day parts, never an instant.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The day's midday on the phone's calendar, which the picker shows as that day. */
export function dayToPickerDate(day: string): Date {
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 12);
}

/** The day the picker's Date shows, as "YYYY-MM-DD". */
export function pickerDateToDay(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-11-06" as "Fri 6 Nov". */
export function pickerDayLabel(day: string): string {
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))).getUTCDay()];
  return `${weekday} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

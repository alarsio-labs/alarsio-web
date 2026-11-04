// Day labels for the working screens. Every day the app shows is a YYYY-MM-DD in
// India time (the pages compute it that way), so no time zone maths happens here.

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 30 Oct" for "2026-10-30"; the input unchanged if it is not a date. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY[weekday]} ${d} ${MONTH[m - 1]}`;
}

/** The eyebrow over a page title: "Fri 30 Oct · Asia/Kolkata". */
export function eyebrowFor(date: string): string {
  const day = dayLabel(date);
  return day === date ? "Asia/Kolkata" : `${day} · Asia/Kolkata`;
}

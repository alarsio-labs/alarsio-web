// CSV for the data export (#76): RFC 4180, CRLF line ends, UTF-8 with a BOM so
// Excel reads Devanagari and other non-Latin names correctly.

// A text cell starting with one of these runs as a formula in Excel, Sheets and
// LibreOffice. Such a cell is prefixed with ' (OWASP "CSV injection"). Only
// text: a negative number stays a number.
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
// U+FEFF, written as a code point so no editor turns it into an invisible character.
export const BOM = String.fromCharCode(0xfeff);

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("cannot write a non-finite number to CSV");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  // jsonb columns (audit_log.old_data / new_data) arrive as objects or arrays.
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const safe = FORMULA_START.test(text) ? "'" + text : text;
  return NEEDS_QUOTES.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

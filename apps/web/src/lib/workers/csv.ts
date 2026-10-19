// A small RFC 4180 CSV reader: commas, double-quoted fields, "" inside quotes,
// CRLF or LF line ends, and a UTF-8 BOM from Excel's "Save as CSV". Spaces
// before an opening quote are allowed, as hand-edited files often have them.

export class CsvError extends Error {}

export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let quoteLine = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      quoted = true;
      quoteLine = line;
      field = "";
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      line++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (quoted) throw new CsvError(`A quote opened on line ${quoteLine} is never closed.`);
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

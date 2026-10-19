// Turns a spreadsheet (CSV or Excel, already read into rows of cells) into the
// rows import_workers() takes. Pure, so it is tested without a browser.
// The database checks every value again; this only catches what a person can
// fix in their file before sending it.

export const MAX_IMPORT_ROWS = 1000; // matches import_workers()
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type ImportRow = {
  code: string;
  full_name: string;
  trade: string;
  pay_type: string;
  phone?: string;
};

export type RosterFile = {
  rows: ImportRow[];
  /** The file line of each row (1 = the header), so messages name the real line. */
  lines: number[];
  /** Problems that stop the whole file. Row-level problems come back from the database. */
  problems: string[];
  /** Things worth checking that do not stop the import. */
  warnings: string[];
};

type Column = keyof ImportRow;

const ALIASES: Record<string, Column> = {
  code: "code",
  "worker code": "code",
  "worker id": "code",
  "register no": "code",
  name: "full_name",
  "full name": "full_name",
  "worker name": "full_name",
  trade: "trade",
  skill: "trade",
  "pay type": "pay_type",
  pay: "pay_type",
  "wage type": "pay_type",
  phone: "phone",
  mobile: "phone",
  "phone number": "phone",
  "mobile number": "phone"
};

const REQUIRED: Column[] = ["code", "full_name", "trade", "pay_type"];

export const COLUMN_LABEL: Record<Column, string> = {
  code: "Worker code",
  full_name: "Name",
  trade: "Trade",
  pay_type: "Pay type",
  phone: "Phone"
};

/** A cell as text, or a reason it cannot be used as text. */
export type CellResult = { text: string; numeric: boolean } | { problem: string };

export function cellText(cell: unknown): CellResult {
  if (cell === null || cell === undefined) return { text: "", numeric: false };
  if (typeof cell === "string") return { text: cell.trim(), numeric: false };
  if (typeof cell === "number") {
    if (!Number.isFinite(cell) || !Number.isSafeInteger(Math.trunc(cell)) || Math.abs(cell) >= 1e15) {
      return { problem: "is a number too large to read exactly" };
    }
    return { text: String(cell), numeric: true };
  }
  if (cell instanceof Date) return { problem: "is a date" };
  if (typeof cell === "boolean") return { problem: "is TRUE or FALSE" };
  return { problem: "cannot be read as text" };
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

const empty = (problems: string[]): RosterFile => ({ rows: [], lines: [], problems, warnings: [] });

export function readRosterTable(table: readonly (readonly unknown[])[]): RosterFile {
  // Keep each row's real line number before dropping blank lines.
  const numbered = table
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter(({ cells }) => cells.some((c) => { const r = cellText(c); return "problem" in r || r.text !== ""; }));
  if (numbered.length === 0) return empty(["The file is empty."]);

  const [head, ...body] = numbered;
  const header = (head?.cells ?? []).map((c) => { const r = cellText(c); return "text" in r ? normaliseHeader(r.text) : ""; });
  const index = new Map<Column, number>();
  const problems: string[] = [];
  header.forEach((h, i) => {
    const column = ALIASES[h];
    if (!column) return;
    if (index.has(column)) problems.push(`Two columns are read as ${COLUMN_LABEL[column]}. Keep one.`);
    else index.set(column, i);
  });
  if (problems.length > 0) return empty(problems);

  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length > 0) {
    return empty([`The first row must name the columns. Missing: ${missing.map((c) => COLUMN_LABEL[c]).join(", ")}.`]);
  }
  if (body.length === 0) return empty(["The file has column names but no workers."]);
  if (body.length > MAX_IMPORT_ROWS) {
    return empty([`At most ${MAX_IMPORT_ROWS} workers per file. This one has ${body.length}. Split it.`]);
  }

  const numericCodeLines: number[] = [];
  const rows: ImportRow[] = [];
  const lines: number[] = [];
  for (const { cells, line } of body) {
    const at = (c: Column): string => {
      const i = index.get(c);
      if (i === undefined) return "";
      const r = cellText(cells[i]);
      if ("problem" in r) {
        problems.push(`Line ${line}: ${COLUMN_LABEL[c]} ${r.problem}. Format that column as Text and save again.`);
        return "";
      }
      if (c === "code" && r.numeric) numericCodeLines.push(line);
      return r.text;
    };
    const row: ImportRow = { code: at("code"), full_name: at("full_name"), trade: at("trade"), pay_type: at("pay_type").toLowerCase() };
    const phone = at("phone");
    if (phone) row.phone = phone;
    rows.push(row);
    lines.push(line);
  }

  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const key = row.code.toLowerCase();
    if (!key) return;
    const first = seen.get(key);
    if (first !== undefined) problems.push(`Worker code ${row.code} appears twice (lines ${lines[first]} and ${lines[i]}).`);
    else seen.set(key, i);
  });

  if (problems.length > 0) return empty(problems);

  const warnings =
    numericCodeLines.length > 0
      ? [
          `Excel stored ${numericCodeLines.length === 1 ? "one worker code" : `${numericCodeLines.length} worker codes`} as a number (first on line ${numericCodeLines[0]}). If your codes start with 0, such as 007, format the column as Text and save again, or they import as 7.`
        ]
      : [];
  return { rows, lines, problems: [], warnings };
}

/** Checks a picked file before reading it. Returns a problem, or null. */
export function checkFile(name: string, size: number): string | null {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx")) {
    return "Choose a .csv or .xlsx file. For an older .xls file, save it as .xlsx first.";
  }
  if (size > MAX_FILE_BYTES) return "The file is larger than 5 MB. Split it into smaller files.";
  return null;
}

/** A CSV not saved as UTF-8 turns letters like é into U+FFFD when read. */
export function looksMisencoded(text: string): boolean {
  return text.includes("�");
}

// Turns a spreadsheet (CSV or Excel, already read into rows of cells) into the
// rows import_workers() takes. Pure, so it is tested without a browser.
// The database checks every value again; this only catches what a person can
// fix in their file before sending it.

export const MAX_IMPORT_ROWS = 1000; // matches import_workers()

export type ImportRow = {
  code: string;
  full_name: string;
  trade: string;
  pay_type: string;
  phone?: string;
};

export type RosterFile = {
  rows: ImportRow[];
  /** Problems that stop the whole file. Row-level problems come back from the database. */
  problems: string[];
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

export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return String(cell);
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "boolean") return cell ? "true" : "false";
  return "";
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

export function readRosterTable(table: readonly (readonly unknown[])[]): RosterFile {
  const nonEmpty = table.filter((r) => r.some((c) => cellText(c) !== ""));
  if (nonEmpty.length === 0) return { rows: [], problems: ["The file is empty."] };

  const header = (nonEmpty[0] ?? []).map((c) => normaliseHeader(cellText(c)));
  const index = new Map<Column, number>();
  header.forEach((h, i) => {
    const column = ALIASES[h];
    if (column && !index.has(column)) index.set(column, i);
  });

  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length > 0) {
    return {
      rows: [],
      problems: [
        `The first row must name the columns. Missing: ${missing.map((c) => COLUMN_LABEL[c]).join(", ")}.`
      ]
    };
  }

  const body = nonEmpty.slice(1);
  if (body.length === 0) return { rows: [], problems: ["The file has column names but no workers."] };
  if (body.length > MAX_IMPORT_ROWS) {
    return { rows: [], problems: [`At most ${MAX_IMPORT_ROWS} workers per file. This one has ${body.length}. Split it.`] };
  }

  const at = (r: readonly unknown[], c: Column) => {
    const i = index.get(c);
    return i === undefined ? "" : cellText(r[i]);
  };

  const rows = body.map((r) => {
    const row: ImportRow = {
      code: at(r, "code"),
      full_name: at(r, "full_name"),
      trade: at(r, "trade"),
      pay_type: at(r, "pay_type").toLowerCase()
    };
    const phone = at(r, "phone");
    if (phone) row.phone = phone;
    return row;
  });

  const seen = new Map<string, number>();
  const problems: string[] = [];
  rows.forEach((row, i) => {
    const key = row.code.toLowerCase();
    if (!key) return;
    const first = seen.get(key);
    if (first !== undefined) problems.push(`Worker code ${row.code} appears twice (rows ${first + 2} and ${i + 2}).`);
    else seen.set(key, i);
  });

  return { rows: problems.length > 0 ? [] : rows, problems };
}

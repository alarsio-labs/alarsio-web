// Builds the owner data export (#76, ADR-026): every table in EXPORT_TABLES,
// paged by id, as one ZIP of CSVs plus a manifest. Reading goes through a
// PageReader so this file holds no Supabase code and is tested with a fake.
import { strToU8, zipSync } from "fflate";
import { toCsv } from "./csv";
import { EXPORT_TABLES, WITHHELD_COLUMNS } from "./tables";

// PostgREST's default row cap on a hosted project is 1000; a page never asks
// for more. A lower cap is safe too: paging stops only on an empty page.
export const EXPORT_PAGE_SIZE = 1000;

export type PageQuery = {
  table: string;
  columns: readonly string[];
  orgColumn: "org_id" | "id" | null;
  orgId: string;
  // Rows with an id greater than this, or from the start when null.
  afterId: string | number | null;
  limit: number;
};

export type PageReader = (query: PageQuery) => Promise<Record<string, unknown>[]>;

// Tables where RLS shows the owner less than the whole organisation. Said in
// the manifest so a short file is not mistaken for lost data.
const NOTES: Readonly<Record<string, string>> = {
  profiles: "Only your own profile: each user's profile is private to them.",
  daily_reports: "A draft is visible only to its author, so other users' drafts are not included.",
  report_photos: "Photo files are not included; storage_path names each file in the report-photos bucket.",
  invites: "Invite tokens are never exported.",
  audit_log: "Invite token hashes are removed from old_data and new_data."
};

// write_audit() stores whole rows (ADR-008), so a column the client may not
// read on its own table is still inside audit_log's jsonb. Strip it there too.
function redactAuditRow(row: Record<string, unknown>): Record<string, unknown> {
  const withheld = typeof row.table_name === "string" ? WITHHELD_COLUMNS[row.table_name] : undefined;
  if (!withheld) return row;
  const strip = (data: unknown) => {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return data;
    return Object.fromEntries(Object.entries(data).filter(([k]) => !withheld.includes(k)));
  };
  return { ...row, old_data: strip(row.old_data), new_data: strip(row.new_data) };
}

async function readAll(read: PageReader, base: Omit<PageQuery, "afterId" | "limit">) {
  const rows: Record<string, unknown>[] = [];
  let afterId: string | number | null = null;
  for (;;) {
    const page = await read({ ...base, afterId, limit: EXPORT_PAGE_SIZE });
    if (page.length === 0) return rows;
    rows.push(...page);
    const last = page.at(-1)?.id;
    if ((typeof last !== "string" && typeof last !== "number") || last === afterId) {
      throw new Error(`export of ${base.table} did not advance past id ${String(afterId)}`);
    }
    afterId = last;
  }
}

export async function runExport(input: {
  orgId: string;
  userId: string;
  at: Date;
  read: PageReader;
}): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const manifest: Record<string, unknown>[] = [];
  const exportedAt = input.at.toISOString();

  // One table at a time: a few hundred rows a page, about twenty tables, and
  // no reason to hold several large tables in memory at once.
  for (const spec of EXPORT_TABLES) {
    const read = await readAll(input.read, {
      table: spec.table,
      columns: spec.columns,
      orgColumn: spec.orgColumn,
      orgId: input.orgId
    });
    const rows = spec.table === "audit_log" ? read.map(redactAuditRow) : read;
    const file = `${spec.table}.csv`;
    files[file] = strToU8(toCsv(spec.columns, rows));
    manifest.push({
      table: spec.table,
      file,
      rows: rows.length,
      exported_at: exportedAt,
      exported_by: input.userId,
      note: NOTES[spec.table] ?? null
    });
  }

  files["manifest.csv"] = strToU8(
    toCsv(["table", "file", "rows", "exported_at", "exported_by", "note"], manifest)
  );
  return zipSync(files, { level: 6, mtime: input.at });
}

export function exportFileName(orgName: string, at: Date): string {
  const slug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `alarsio-export-${slug || "organisation"}-${at.toISOString().slice(0, 10)}.zip`;
}

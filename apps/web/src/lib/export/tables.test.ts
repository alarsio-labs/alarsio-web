import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPORT_EXEMPT, EXPORT_TABLES, WITHHELD_COLUMNS } from "./tables";

// The export reads tables by a fixed list. This reads every migration, so a new
// table or column that is not in the list fails here (issue #76, criterion 9).
// apps/web/turbo.json makes the migrations an input of this task, so the turbo
// cache cannot hide a new migration from it.
const MIGRATIONS = fileURLToPath(new URL("../../../../../supabase/migrations/", import.meta.url));
const NOT_A_COLUMN = new Set(["constraint", "primary", "unique", "foreign", "check", "exclude"]);

function tablesInMigrations(): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(MIGRATIONS + file, "utf8").replaceAll("\r\n", "\n");
    // This parser knows only "create table": a migration that changes a table's
    // columns afterwards must teach it, not slip past it.
    expect(sql, `${file} alters a table's columns; extend tables.test.ts to read it`).not.toMatch(
      /alter\s+table[^;]*\b(add|drop|rename)\s+column\b/i
    );
    expect(sql, `${file} drops or renames a table; extend tables.test.ts to read it`).not.toMatch(
      /\bdrop\s+table\b|alter\s+table[^;]*\brename\s+to\b/i
    );
    for (const [, table = "", body = ""] of sql.matchAll(/^create table public\.([a-z_][a-z0-9_]*) \(\n([\s\S]*?)\n\);/gm)) {
      const columns: string[] = [];
      // A column is a line indented by exactly two spaces; continuation lines
      // (a check on its own line) are indented further.
      for (const line of body.split("\n")) {
        const col = /^ {2}([a-z_][a-z0-9_]*)\s/.exec(line)?.[1];
        if (col && !NOT_A_COLUMN.has(col)) columns.push(col);
      }
      tables.set(table, columns);
    }
  }
  return tables;
}

describe("export table list", () => {
  const inMigrations = tablesInMigrations();

  it("finds the tables (the parser is not silently matching nothing)", () => {
    expect(inMigrations.size).toBeGreaterThanOrEqual(20);
    expect(inMigrations.get("workers")).toContain("full_name");
  });

  it("exports or exempts every table, and nothing that is not a table", () => {
    const listed = [...EXPORT_TABLES.map((t) => t.table), ...EXPORT_EXEMPT];
    const missing = [...inMigrations.keys()].filter((t) => !listed.includes(t));
    const unknown = listed.filter((t) => !inMigrations.has(t));
    expect(missing, "tables neither in EXPORT_TABLES nor EXPORT_EXEMPT (lib/export/tables.ts)").toEqual([]);
    expect(unknown, "listed in lib/export/tables.ts but not created by any migration").toEqual([]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("exempts only the two tables closed to every client (ADR-012)", () => {
    expect([...EXPORT_EXEMPT].sort()).toEqual(["purge_log", "rate_limit_counters"]);
  });

  it("exports every column, in table order, except the withheld ones", () => {
    for (const spec of EXPORT_TABLES) {
      const withheld = WITHHELD_COLUMNS[spec.table] ?? [];
      const expected = (inMigrations.get(spec.table) ?? []).filter((c) => !withheld.includes(c));
      expect(spec.columns, spec.table).toEqual(expected);
    }
  });

  it("never exports an invite's token hash", () => {
    const invites = EXPORT_TABLES.find((t) => t.table === "invites");
    expect(invites?.columns).not.toContain("token_hash");
    expect(WITHHELD_COLUMNS.invites).toEqual(["token_hash"]);
  });

  it("filters every table to the organisation", () => {
    for (const spec of EXPORT_TABLES) {
      const columns = inMigrations.get(spec.table) ?? [];
      if (spec.table === "organizations") expect(spec.orgColumn).toBe("id");
      else if (spec.table === "profiles") expect(spec.orgColumn).toBeNull();
      else {
        expect(columns, spec.table).toContain("org_id");
        expect(spec.orgColumn, spec.table).toBe("org_id");
      }
    }
  });

  it("pages every table by its id", () => {
    for (const spec of EXPORT_TABLES) expect(spec.columns[0], spec.table).toBe("id");
  });
});

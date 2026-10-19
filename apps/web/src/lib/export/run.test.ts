import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { EXPORT_PAGE_SIZE, exportFileName, runExport, type PageQuery, type PageReader } from "./run";
import { BOM } from "./csv";
import { EXPORT_TABLES } from "./tables";

const ORG = "aaaaaaaa-0000-0000-0000-000000000001";
const OWNER = "a0000000-0000-0000-0000-00000000000a";
const AT = new Date("2026-10-19T08:30:00Z");

type Row = Record<string, unknown>;

// A fake PostgREST: each table holds rows, and a page is the rows of the asked
// organisation with an id after the cursor, ordered by id, at most `limit`.
function fakeReader(data: Record<string, Row[]>) {
  const calls: PageQuery[] = [];
  const reader: PageReader = async (q) => {
    calls.push(q);
    const rows = (data[q.table] ?? [])
      .filter((r) => q.orgColumn === null || r[q.orgColumn] === q.orgId)
      .filter((r) => q.afterId === null || String(r.id) > String(q.afterId))
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
      .slice(0, q.limit);
    return rows.map((r) => Object.fromEntries(q.columns.map((c) => [c, r[c]])));
  };
  return { reader, calls };
}

function unzip(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));
}

// A missing file reads as empty, so the assertion on its lines fails instead.
function lines(csv: string | undefined = ""): string[] {
  return (csv.startsWith(BOM) ? csv.slice(1) : csv).split("\r\n").filter((l) => l.length > 0);
}

describe("runExport", () => {
  it("writes one CSV per table and a manifest", async () => {
    const { reader } = fakeReader({
      organizations: [{ id: ORG, name: "Org A", timezone: "Asia/Kolkata", currency: "INR" }],
      workers: [
        { id: "w1", org_id: ORG, code: "W-1", full_name: "Asha" },
        { id: "w2", org_id: ORG, code: "W-2", full_name: "=cmd" }
      ]
    });
    const files = unzip(await runExport({ orgId: ORG, userId: OWNER, at: AT, read: reader }));

    expect(Object.keys(files).sort()).toEqual(
      [...EXPORT_TABLES.map((t) => `${t.table}.csv`), "manifest.csv"].sort()
    );
    const workers = lines(files["workers.csv"]);
    expect(workers[0]).toBe(EXPORT_TABLES.find((t) => t.table === "workers")?.columns.join(","));
    expect(workers).toHaveLength(3);
    expect(workers[2]).toContain("'=cmd");
    // An empty table still has its header.
    expect(lines(files["materials.csv"])).toHaveLength(1);
  });

  it("filters every table to the organisation, and profiles by RLS alone", async () => {
    const { reader, calls } = fakeReader({});
    await runExport({ orgId: ORG, userId: OWNER, at: AT, read: reader });
    for (const spec of EXPORT_TABLES) {
      const first = calls.find((c) => c.table === spec.table);
      expect(first?.orgColumn, spec.table).toBe(spec.orgColumn);
      expect(first?.orgId).toBe(ORG);
      expect(first?.columns).toEqual(spec.columns);
    }
  });

  it("leaves out another organisation's rows", async () => {
    const { reader } = fakeReader({
      sites: [
        { id: "s1", org_id: ORG, name: "Ours" },
        { id: "s2", org_id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Theirs" }
      ]
    });
    const files = unzip(await runExport({ orgId: ORG, userId: OWNER, at: AT, read: reader }));
    expect(files["sites.csv"]).toContain("Ours");
    expect(files["sites.csv"]).not.toContain("Theirs");
  });

  it("pages past the row cap and exports every row exactly once", async () => {
    const total = EXPORT_PAGE_SIZE * 2 + 7;
    const rows = Array.from({ length: total }, (_, i) => ({
      id: `e${String(i).padStart(6, "0")}`,
      org_id: ORG,
      status: "present"
    }));
    const { reader, calls } = fakeReader({ attendance_entries: rows });
    const files = unzip(await runExport({ orgId: ORG, userId: OWNER, at: AT, read: reader }));

    const body = lines(files["attendance_entries.csv"]).slice(1);
    expect(body).toHaveLength(total);
    expect(new Set(body.map((l) => l.split(",")[0])).size).toBe(total);

    const pages = calls.filter((c) => c.table === "attendance_entries");
    expect(pages.map((p) => p.afterId)).toEqual([
      null,
      rows[EXPORT_PAGE_SIZE - 1]?.id,
      rows[EXPORT_PAGE_SIZE * 2 - 1]?.id,
      rows[total - 1]?.id
    ]);
    expect(pages.every((p) => p.limit === EXPORT_PAGE_SIZE)).toBe(true);
  });

  it("keeps paging until an empty page, so a server row cap below the page size loses nothing", async () => {
    const SERVER_CAP = 300;
    const rows = Array.from({ length: 750 }, (_, i) => ({ id: `m${String(i).padStart(6, "0")}`, org_id: ORG }));
    const { reader: uncapped } = fakeReader({ materials: rows });
    const calls: PageQuery[] = [];
    const read: PageReader = async (q) => {
      if (q.table === "materials") calls.push(q);
      return (await uncapped(q)).slice(0, SERVER_CAP);
    };
    const files = unzip(await runExport({ orgId: ORG, userId: OWNER, at: AT, read }));
    expect(lines(files["materials.csv"]).slice(1)).toHaveLength(750);
    expect(calls).toHaveLength(4);
  });

  it("never exports an invite's token hash, not even from the audit log", async () => {
    const invite = { id: "i1", org_id: ORG, email: "a@x.in", token_hash: "\\xdeadbeef" };
    const { reader } = fakeReader({
      audit_log: [
        { id: 1, table_name: "invites", org_id: ORG, operation: "INSERT", old_data: null, new_data: invite },
        { id: 2, table_name: "invites", org_id: ORG, operation: "UPDATE", old_data: invite, new_data: { ...invite, revoked_at: "2026-10-19" } },
        { id: 3, table_name: "workers", org_id: ORG, operation: "INSERT", old_data: null, new_data: { id: "w1", token_hash: "kept" } }
      ]
    });
    const files = unzip(await runExport({ orgId: ORG, userId: OWNER, at: AT, read: reader }));
    const audit = files["audit_log.csv"] ?? "";
    expect(audit).not.toContain("deadbeef");
    expect(audit).toContain("a@x.in");
    expect(audit).toContain("revoked_at");
    // Only the invites rows are redacted; another table's key of the same name is not.
    expect(audit).toContain("kept");
  });

  it("writes the manifest: table, file, rows, when, who, and a note where rows are held back", async () => {
    const { reader } = fakeReader({ workers: [{ id: "w1", org_id: ORG }] });
    const files = unzip(await runExport({ orgId: ORG, userId: OWNER, at: AT, read: reader }));
    const manifest = lines(files["manifest.csv"]);
    expect(manifest[0]).toBe("table,file,rows,exported_at,exported_by,note");
    expect(manifest).toHaveLength(EXPORT_TABLES.length + 1);
    expect(manifest).toContain(`workers,workers.csv,1,2026-10-19T08:30:00.000Z,${OWNER},`);
    const note = (t: string) => manifest.find((l) => l.startsWith(t + ","));
    expect(note("profiles")).toMatch(/your own profile/);
    expect(note("daily_reports")).toMatch(/drafts/);
    expect(note("report_photos")).toMatch(/files are not included/);
    expect(note("invites")).toMatch(/token/);
    expect(note("audit_log")).toMatch(/token/);
  });

  it("fails as a whole when any page fails, so no partial file is made", async () => {
    const { reader: good } = fakeReader({});
    const read: PageReader = async (q) => {
      if (q.table === "daily_reports") throw new Error("permission denied for table daily_reports");
      return good(q);
    };
    await expect(runExport({ orgId: ORG, userId: OWNER, at: AT, read })).rejects.toThrow(/daily_reports/);
  });

  it("refuses a page whose ids do not move forward, instead of looping", async () => {
    const stuck = Array.from({ length: EXPORT_PAGE_SIZE }, () => ({ id: "same", org_id: ORG }));
    const read: PageReader = async () => stuck;
    await expect(runExport({ orgId: ORG, userId: OWNER, at: AT, read })).rejects.toThrow(/did not advance/);
  });
});

describe("exportFileName", () => {
  it("names the file after the organisation and the UTC date", () => {
    expect(exportFileName("Sharma Builders & Sons", AT)).toBe("alarsio-export-sharma-builders-sons-2026-10-19.zip");
  });

  it("falls back when the name has no Latin letters or digits", () => {
    expect(exportFileName("शर्मा", AT)).toBe("alarsio-export-organisation-2026-10-19.zip");
  });

  it("keeps the slug short and free of path characters", () => {
    const name = exportFileName("../../" + "x".repeat(200), AT);
    expect(name).toMatch(/^alarsio-export-[a-z0-9-]{1,40}-2026-10-19\.zip$/);
  });
});

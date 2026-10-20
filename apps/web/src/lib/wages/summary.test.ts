import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { BOM } from "../export/csv";
import { formatPaise, formatRupees, summaryCsv, summaryTable, toPaise, toSummaryRow, type SummaryRow } from "./summary";
import { summaryXlsx } from "./xlsx";

function row(over: Partial<SummaryRow> = {}): SummaryRow {
  return {
    worker_id: "00000000-0000-0000-0000-000000000001",
    worker_code: "W-001",
    worker_name: "Ravi",
    pay_type: "daily",
    payable_days: 4,
    overtime_hours: 0,
    rate_from: 800,
    rate_to: 800,
    pay_amount: 3200,
    overtime_amount: 0,
    adjustments_amount: 0,
    total_amount: 3200,
    no_rate_days: 0,
    ...over
  };
}

// Figures in the style of supabase/tests/wages_test.sql, section 3.
const ROWS: SummaryRow[] = [
  row(),
  row({
    worker_code: "W-006", worker_name: "Dev", payable_days: 2, overtime_hours: 2, rate_from: 833.33, rate_to: 833.33,
    pay_amount: 1666.66, overtime_amount: 416.67, total_amount: 2083.33
  }),
  row({
    worker_code: "W-005", worker_name: "Mala", payable_days: 1, rate_from: null, rate_to: null, pay_amount: 0,
    adjustments_amount: -200.1, total_amount: -200.1, no_rate_days: 1
  })
];

const NUMERIC = [3, 4, 5, 6, 7, 8, 9, 10, 11];

describe("paise", () => {
  it("is exact for two-decimal rupees that floating point cannot hold", () => {
    expect(toPaise(416.67)).toBe(41667);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(-200.1)).toBe(-20010);
  });

  it("always prints two decimals and keeps the sign", () => {
    expect(formatPaise(320000)).toBe("3200.00");
    expect(formatPaise(5)).toBe("0.05");
    expect(formatPaise(-20010)).toBe("-200.10");
    expect(formatPaise(0)).toBe("0.00");
    expect(formatRupees(416.665)).toBe("416.67");
  });
});

describe("toSummaryRow", () => {
  it("accepts a view row, numbers sent as strings included", () => {
    const r = toSummaryRow({ ...row(), pay_amount: "3200.00", rate_from: "800.00" });
    expect(r?.pay_amount).toBe(3200);
    expect(r?.rate_from).toBe(800);
  });

  it("refuses a row that is not one", () => {
    expect(toSummaryRow(null)).toBeNull();
    expect(toSummaryRow({ ...row(), pay_type: "monthly" })).toBeNull();
    expect(toSummaryRow({ ...row(), total_amount: null })).toBeNull();
    expect(toSummaryRow({ ...row(), worker_code: 7 })).toBeNull();
  });
});

describe("summaryTable", () => {
  it("adds the totals in whole paise, so the total is the sum of the lines shown", () => {
    const t = summaryTable(ROWS);
    const paise = (i: number) => t.body.reduce((s, r) => s + Math.round(Number(r[i]) * 100), 0);
    expect(t.totals[6]).toBe(formatPaise(paise(6)));
    expect(t.totals[10]).toBe(formatPaise(paise(10)));
    expect(t.totals[10]).toBe("5083.23"); // 3200.00 + 2083.33 - 200.10
    expect(t.totals[3]).toBe("7.00");
    expect(t.totals[11]).toBe("1");
  });

  it("shows a missing rate as blank, never 0", () => {
    const t = summaryTable(ROWS);
    expect(t.body[2]?.[4]).toBe("");
    expect(t.body[2]?.[11]).toBe("1");
  });
});

describe("export matches the screen (AC 9)", () => {
  const table = summaryTable(ROWS);
  const screen = [...table.body, table.totals];

  it("CSV carries every screen figure to the paisa", () => {
    const csv = summaryCsv(ROWS);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(BOM.length).trimEnd().split("\r\n");
    expect(lines).toHaveLength(screen.length + 1);
    expect(lines[0]).toBe(table.header.join(","));
    screen.forEach((cells, i) => {
      const parsed = (lines[i + 1] ?? "").split(",");
      for (const c of NUMERIC) expect(parsed[c], `row ${i + 2} column ${c}`).toBe(cells[c]);
    });
  });

  it("CSV writes a negative amount as a number, not as text with a quote in front", () => {
    expect(summaryCsv(ROWS)).toContain(",-200.10,-200.10,1");
  });

  it("CSV neutralises a name that would run as a formula", () => {
    expect(summaryCsv([row({ worker_name: "=1+1" })])).toContain("'=1+1");
  });

  it("Excel carries every screen figure to the paisa", () => {
    const files = unzipSync(summaryXlsx(ROWS));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"] as Uint8Array);
    const byCell = new Map(
      [...sheet.matchAll(/<c r="([A-Z])(\d+)" s="1"><v>([^<]+)<\/v><\/c>/g)].map((m) => [`${m[1]}${m[2]}`, m[3]])
    );
    screen.forEach((cells, i) => {
      for (const c of NUMERIC) {
        const text = cells[c] ?? "";
        if (text === "") continue;
        expect(byCell.get(`${String.fromCharCode(65 + c)}${i + 2}`), `row ${i + 2} column ${c}`).toBe(text);
      }
    });
  });

  it("an independent reader opens the Excel file and finds the screen's figures", async () => {
    const { readSheet } = await import("read-excel-file/node");
    const { Buffer } = await import("node:buffer");
    const cells = (await readSheet(Buffer.from(summaryXlsx(ROWS)))) as unknown[][];
    expect(cells).toHaveLength(screen.length + 1);
    expect(cells[0]).toEqual([...table.header]);
    screen.forEach((expected, i) => {
      const got = cells[i + 1] ?? [];
      for (const c of NUMERIC) {
        const want = expected[c] ?? "";
        if (want === "") continue;
        expect(Number(got[c]), `row ${i + 2} column ${c}`).toBe(Number(want));
      }
      expect(got[0]).toBe(expected[0]);
    });
  });

  it("Excel keeps a formula-looking name as text", () => {
    const files = unzipSync(summaryXlsx([row({ worker_name: "=1+1" })]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"] as Uint8Array);
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("=1+1");
  });

  it("Excel escapes markup in a name", () => {
    const files = unzipSync(summaryXlsx([row({ worker_name: "A & <B>" })]));
    expect(strFromU8(files["xl/worksheets/sheet1.xml"] as Uint8Array)).toContain("A &amp; &lt;B&gt;");
  });

  it("an Excel file has the parts a reader needs", () => {
    const files = unzipSync(summaryXlsx(ROWS));
    for (const name of [
      "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml",
      "xl/worksheets/sheet1.xml"
    ]) {
      expect(files[name], name).toBeDefined();
    }
  });
});

import { strToU8, zipSync } from "fflate";
import { NUMERIC_COLUMNS, summaryTable, type SummaryRow } from "./summary";

// A minimal .xlsx writer for the wage summary: one sheet, text as inline strings
// (so a name that starts with = is text, never a formula), numbers as the exact
// decimal text the screen shows. No library: an .xlsx is a ZIP of a few XML files.

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 cannot carry at all.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

const NUMBER = /^-?\d+(\.\d+)?$/;

function column(i: number): string {
  // Twelve columns today; A to Z is enough and a wider sheet would fail loudly here.
  if (i > 25) throw new Error("the wage sheet has more than 26 columns");
  return String.fromCharCode(65 + i);
}

function cell(text: string, col: number, row: number, numeric: boolean): string {
  const ref = `${column(col)}${row}`;
  if (numeric && NUMBER.test(text)) return `<c r="${ref}" s="1"><v>${text}</v></c>`;
  if (text === "") return `<c r="${ref}"/>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function sheetXml(lines: readonly (readonly string[])[], headerRows: number): string {
  const rows = lines
    .map((cells, r) => {
      const n = r + 1;
      const isHeader = r < headerRows;
      const out = cells.map((t, c) => cell(t, c, n, !isHeader && NUMERIC_COLUMNS.has(c))).join("");
      return `<row r="${n}">${out}</row>`;
    })
    .join("");
  return `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES =
  `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  // 0 = general; 1 = number with two decimals (built-in format 2).
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  "</styleSheet>";

/** The wage summary as an .xlsx file: a header row, one row per worker, a totals row. */
export function summaryXlsx(rows: readonly SummaryRow[], sheetName = "Wages"): Uint8Array {
  const t = summaryTable(rows);
  const sheet = sheetXml([t.header, ...t.body, t.totals], 1);
  const name = escapeXml(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Wages");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>"
    ),
    "_rels/.rels": strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>"
    ),
    "xl/workbook.xml": strToU8(
      `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>"
    ),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(sheet)
  });
}

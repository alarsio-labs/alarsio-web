import { describe, expect, it } from "vitest";
import { BOM, csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("writes an empty cell for null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("writes numbers and booleans as they are, negative numbers included", () => {
    expect(csvCell(42)).toBe("42");
    expect(csvCell(-5.25)).toBe("-5.25");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
  });

  it("leaves plain text alone", () => {
    expect(csvCell("Ramesh Kumar")).toBe("Ramesh Kumar");
    expect(csvCell("रमेश")).toBe("रमेश");
    expect(csvCell("2026-10-19")).toBe("2026-10-19");
    expect(csvCell("")).toBe("");
  });

  it("quotes a cell holding a comma, a quote or a line break, and doubles the quote", () => {
    expect(csvCell("Pune, Maharashtra")).toBe('"Pune, Maharashtra"');
    expect(csvCell('12" pipe')).toBe('"12"" pipe"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("prefixes text that a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+91 98200 00000")).toBe("'+91 98200 00000");
    expect(csvCell("-5 bags")).toBe("'-5 bags");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
  });

  it("does not prefix a formula character that is not first", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("Block A - floor 2")).toBe("Block A - floor 2");
  });

  it("writes jsonb as JSON text, quoted and guarded like any text", () => {
    expect(csvCell({ status: "submitted", headcount: 12 })).toBe('"{""status"":""submitted"",""headcount"":12}"');
    expect(csvCell(["a", "b"])).toBe('"[""a"",""b""]"');
  });

  it("refuses a number that is not finite rather than writing NaN", () => {
    expect(() => csvCell(Number.NaN)).toThrow();
    expect(() => csvCell(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("toCsv", () => {
  it("starts with a BOM, writes the header, and ends every line with CRLF", () => {
    expect(BOM).toHaveLength(1);
    expect(BOM.codePointAt(0)).toBe(0xfeff);
    const out = toCsv(["id", "name"], [{ id: "1", name: "Asha" }, { id: "2", name: "Ravi, Jr" }]);
    expect(out).toBe(BOM + 'id,name\r\n1,Asha\r\n2,"Ravi, Jr"\r\n');
  });

  it("writes only the header for an empty table", () => {
    expect(toCsv(["id", "name"], [])).toBe(BOM + "id,name\r\n");
  });

  it("writes columns in the order given and an empty cell for a missing key", () => {
    expect(toCsv(["b", "a", "c"], [{ a: 1, b: 2 }])).toBe(BOM + "b,a,c\r\n2,1,\r\n");
  });
});

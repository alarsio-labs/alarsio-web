import { describe, expect, it } from "vitest";
import { CsvError, parseCsv } from "./csv";
import { reasonText } from "./import-result";
import { MAX_IMPORT_ROWS, cellText, checkFile, looksMisencoded, readRosterTable } from "./roster-file";

describe("parseCsv", () => {
  it("reads quotes, escaped quotes, commas in quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"']
    ]);
  });

  it("drops an Excel BOM and keeps a last line with no newline", () => {
    expect(parseCsv("﻿code,name\nW1,Ravi")).toEqual([
      ["code", "name"],
      ["W1", "Ravi"]
    ]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c\n")).toEqual([["a", "", "c"]]);
  });

  it("reads a quoted field after a space", () => {
    expect(parseCsv('a, "x, y"\n')).toEqual([["a", "x, y"]]);
  });

  it("fails on a quote that never closes, naming the line", () => {
    expect(() => parseCsv('code,name\nW1,"Ravi\nW2,Sita\n')).toThrow(CsvError);
    expect(() => parseCsv('code,name\nW1,"Ravi\nW2,Sita\n')).toThrow("line 2");
  });
});

describe("cellText", () => {
  it("reads strings and whole numbers, and flags numbers", () => {
    expect(cellText("  W-1 ")).toEqual({ text: "W-1", numeric: false });
    expect(cellText(101)).toEqual({ text: "101", numeric: true });
    expect(cellText(9876543210)).toEqual({ text: "9876543210", numeric: true });
    expect(cellText(null)).toEqual({ text: "", numeric: false });
  });

  it("refuses dates, booleans and numbers too large to read exactly", () => {
    expect(cellText(new Date("2026-01-01"))).toEqual({ problem: "is a date" });
    expect(cellText(true)).toEqual({ problem: "is TRUE or FALSE" });
    expect(cellText(1e21)).toEqual({ problem: "is a number too large to read exactly" });
  });
});

describe("readRosterTable", () => {
  const header = ["Worker Code", "Name", "Trade", "Pay Type", "Mobile"];

  it("maps headers by name in any order and case, and lowercases pay type", () => {
    const r = readRosterTable([
      ["trade", "PAY_TYPE", "code", "full name"],
      ["mason", "Daily", "W-101", "Ravi"]
    ]);
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([{ code: "W-101", full_name: "Ravi", trade: "mason", pay_type: "daily" }]);
    expect(r.lines).toEqual([2]);
  });

  it("keeps the real file line when blank lines are skipped", () => {
    const r = readRosterTable([header, [], ["W-1", "Sita", "helper", "hourly", "98765 43210"], ["", "", "", "", ""], ["W-2", "Anil", "mason", "daily"]]);
    expect(r.rows.map((x) => x.code)).toEqual(["W-1", "W-2"]);
    expect(r.lines).toEqual([3, 5]);
    expect(r.rows[0]?.phone).toBe("98765 43210");
  });

  it("names the real lines of a duplicate code, after a blank line", () => {
    const r = readRosterTable([header, [], ["W-1", "A", "t", "daily"], ["w-1", "B", "t", "daily"]]);
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toBe("Worker code w-1 appears twice (lines 3 and 4).");
  });

  it("refuses a date or boolean cell, naming the line and column", () => {
    const r = readRosterTable([header, ["W-1", "A", "t", "daily", new Date("2026-01-01")]]);
    expect(r.problems[0]).toBe("Line 2: Phone is a date. Format that column as Text and save again.");
    expect(readRosterTable([header, ["W-1", true, "t", "daily"]]).problems[0]).toMatch(/Line 2: Name is TRUE or FALSE/);
  });

  it("warns when Excel stored codes as numbers", () => {
    const r = readRosterTable([header, [7, "A", "t", "daily"]]);
    expect(r.rows[0]?.code).toBe("7");
    expect(r.warnings[0]).toMatch(/first on line 2.*007/);
  });

  it("refuses two columns that mean the same thing", () => {
    expect(readRosterTable([["code", "worker code", "name", "trade", "pay type"], ["A", "B", "n", "t", "daily"]]).problems[0]).toBe(
      "Two columns are read as Worker code. Keep one."
    );
  });

  it("names the missing required columns", () => {
    const r = readRosterTable([["code", "name"], ["W1", "Ravi"]]);
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toContain("Missing: Trade, Pay type");
  });

  it("refuses an empty file, a header-only file and an oversized file", () => {
    expect(readRosterTable([]).problems[0]).toMatch(/empty/);
    expect(readRosterTable([header]).problems[0]).toMatch(/no workers/);
    const big = [header, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`W${i}`, "x", "y", "daily"])];
    expect(readRosterTable(big).problems[0]).toMatch(/At most 1000/);
  });

  it("leaves value checks to the database: a bad pay type still goes through", () => {
    expect(readRosterTable([header, ["W-1", "A", "t", "monthly"]]).rows[0]?.pay_type).toBe("monthly");
  });
});

describe("checkFile and encoding", () => {
  it("accepts .csv and .xlsx under 5 MB", () => {
    expect(checkFile("Roster.CSV", 100)).toBeNull();
    expect(checkFile("roster.xlsx", 5 * 1024 * 1024)).toBeNull();
  });

  it("refuses other types and big files", () => {
    expect(checkFile("roster.xls", 100)).toMatch(/save it as \.xlsx/);
    expect(checkFile("roster.pdf", 100)).toMatch(/Choose a \.csv or \.xlsx/);
    expect(checkFile("roster.csv", 5 * 1024 * 1024 + 1)).toMatch(/larger than 5 MB/);
  });

  it("spots a CSV that was not saved as UTF-8", () => {
    expect(looksMisencoded("Jos�")).toBe(true);
    expect(looksMisencoded("José")).toBe(false);
  });
});

describe("reasonText", () => {
  it("explains each reason, and every rule for an invalid value", () => {
    expect(reasonText("pay_type_locked")).toMatch(/already has a wage rate/);
    expect(reasonText("invalid_value")).toMatch(/up to 40 characters.*up to 120.*up to 60/);
  });

  it("does not treat inherited keys as reasons", () => {
    expect(reasonText("constructor")).toBe("could not be saved");
    expect(reasonText(undefined)).toBe("could not be saved");
  });
});

import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { MAX_IMPORT_ROWS, readRosterTable } from "./roster-file";

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
});

describe("readRosterTable", () => {
  const header = ["Worker Code", "Name", "Trade", "Pay Type", "Mobile"];

  it("maps headers by name in any order and case, and lowercases pay type", () => {
    const r = readRosterTable([
      ["trade", "PAY_TYPE", "code", "full name"],
      ["mason", "Daily", 101, "Ravi"]
    ]);
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([{ code: "101", full_name: "Ravi", trade: "mason", pay_type: "daily" }]);
  });

  it("keeps phone when given and skips blank lines", () => {
    const r = readRosterTable([header, [], ["W-1", "Sita", "helper", "hourly", "98765 43210"], ["", "", "", "", ""]]);
    expect(r.rows).toEqual([{ code: "W-1", full_name: "Sita", trade: "helper", pay_type: "hourly", phone: "98765 43210" }]);
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

  it("refuses a file with the same code twice, ignoring case", () => {
    const r = readRosterTable([header, ["W-1", "A", "t", "daily"], ["w-1", "B", "t", "daily"]]);
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toBe("Worker code w-1 appears twice (rows 2 and 3).");
  });

  it("leaves value checks to the database: a bad pay type still goes through", () => {
    const r = readRosterTable([header, ["W-1", "A", "t", "monthly"]]);
    expect(r.rows[0]?.pay_type).toBe("monthly");
  });
});

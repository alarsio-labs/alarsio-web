import { describe, expect, it } from "vitest";
import { sortReports, type SortableReport } from "./order";

const r = (id: string, report_date: string, flagged: boolean, status: SortableReport["status"]): SortableReport => ({
  id,
  report_date,
  flagged,
  status
});

describe("sortReports", () => {
  it("puts the newest date first", () => {
    const out = sortReports([r("a", "2026-10-17", false, "submitted"), r("b", "2026-10-19", false, "submitted")]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("puts flagged first within a day", () => {
    const out = sortReports([r("a", "2026-10-19", false, "submitted"), r("b", "2026-10-19", true, "submitted")]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("puts unreviewed before reviewed within a day and flag", () => {
    const out = sortReports([r("a", "2026-10-19", true, "reviewed"), r("b", "2026-10-19", true, "submitted")]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("puts a sent-back report after one waiting for review and before a reviewed one", () => {
    const out = sortReports([
      r("reviewed", "2026-10-19", false, "reviewed"),
      r("sent-back", "2026-10-19", false, "rejected"),
      r("waiting", "2026-10-19", false, "submitted")
    ]);
    expect(out.map((x) => x.id)).toEqual(["waiting", "sent-back", "reviewed"]);
  });

  it("a flag outranks review state, and a date outranks a flag", () => {
    const out = sortReports([
      r("old-flag", "2026-10-18", true, "submitted"),
      r("new-reviewed", "2026-10-19", false, "reviewed"),
      r("new-flag-reviewed", "2026-10-19", true, "reviewed"),
      r("new-plain", "2026-10-19", false, "submitted")
    ]);
    expect(out.map((x) => x.id)).toEqual(["new-flag-reviewed", "new-plain", "new-reviewed", "old-flag"]);
  });

  it("is stable on a full tie and does not change its input", () => {
    const input = [r("b", "2026-10-19", false, "submitted"), r("a", "2026-10-19", false, "submitted")];
    const copy = [...input];
    expect(sortReports(input).map((x) => x.id)).toEqual(["a", "b"]);
    expect(input).toEqual(copy);
  });
});

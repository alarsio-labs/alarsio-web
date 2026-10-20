import { describe, expect, it } from "vitest";
import { isReportStatusRow, isRevisionRow } from "./rows";

describe("isReportStatusRow", () => {
  const good = {
    id: "r1",
    site_id: "s1",
    report_date: "2026-10-19",
    author_id: "u1",
    status: "submitted",
    headcount: 12,
    serious_blocker: false,
    safety_incident: false,
    flagged: false,
    photo_count: 0
  };

  it("accepts a submitted, reviewed or sent-back report", () => {
    for (const status of ["submitted", "reviewed", "rejected"]) expect(isReportStatusRow({ ...good, status })).toBe(true);
  });

  it("rejects a draft and an unknown status", () => {
    for (const status of ["draft", "sent_back", ""]) expect(isReportStatusRow({ ...good, status })).toBe(false);
  });
});

describe("isRevisionRow", () => {
  const good = {
    id: "v1",
    revision_no: 1,
    headcount: 12,
    work_done: "Slab",
    blockers: null,
    serious_blocker: false,
    safety_incident: false,
    next_day_plan: null,
    reason: "Recounted",
    edited_at: "2026-10-19T10:00:00Z",
    sent_back_reason: null,
    sent_back_at: null
  };

  it("accepts an ordinary edit and one that answers a send-back", () => {
    expect(isRevisionRow(good)).toBe(true);
    expect(isRevisionRow({ ...good, sent_back_reason: "Wrong count", sent_back_at: "2026-10-19T09:00:00Z" })).toBe(true);
  });

  it("rejects a revision without the send-back columns or with a wrong type", () => {
    const missing: Record<string, unknown> = { ...good };
    delete missing.sent_back_reason;
    expect(isRevisionRow(missing)).toBe(false);
    expect(isRevisionRow({ ...good, sent_back_reason: 3 })).toBe(false);
  });
});

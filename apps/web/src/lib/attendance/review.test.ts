import { describe, expect, it } from "vitest";
import { MAX_REASON, canReviewCorrection, canReviewDay, cleanReason, parseDecision, recordedByViewer, reviewErrorCode } from "./review";

const day = { canReview: true, status: "open", dayRecordedBy: "u-sup", entryRecorders: ["u-sup", "u-sup2"], viewerId: "u-mgr" };
const corr = { canReview: true, reviewStatus: "pending", proposedBy: "u-sup", viewerId: "u-mgr" };

describe("canReviewDay", () => {
  it("is true for a reviewer looking at an open or a rejected day recorded by others", () => {
    expect(canReviewDay(day)).toBe(true);
    expect(canReviewDay({ ...day, status: "rejected" })).toBe(true);
  });
  it("is false for a viewer who cannot review the site", () => {
    expect(canReviewDay({ ...day, canReview: false })).toBe(false);
  });
  it("is false for an approved or unknown day", () => {
    for (const status of ["approved", "x", ""]) expect(canReviewDay({ ...day, status })).toBe(false);
  });
  it("is false when the viewer recorded the day", () => {
    expect(canReviewDay({ ...day, dayRecordedBy: "u-mgr" })).toBe(false);
  });
  it("is false when the viewer recorded any one entry of the day", () => {
    expect(canReviewDay({ ...day, entryRecorders: ["u-sup", "u-mgr"] })).toBe(false);
  });
  it("is true for a day with no entries yet", () => {
    expect(canReviewDay({ ...day, entryRecorders: [] })).toBe(true);
  });
});

describe("recordedByViewer", () => {
  it("is true for the day's recorder and for an entry's recorder, false otherwise", () => {
    expect(recordedByViewer({ dayRecordedBy: "u-mgr", entryRecorders: [], viewerId: "u-mgr" })).toBe(true);
    expect(recordedByViewer({ dayRecordedBy: "u-sup", entryRecorders: ["u-mgr"], viewerId: "u-mgr" })).toBe(true);
    expect(recordedByViewer({ dayRecordedBy: "u-sup", entryRecorders: ["u-sup"], viewerId: "u-mgr" })).toBe(false);
  });
});

describe("canReviewCorrection", () => {
  it("is true for a reviewer and a pending correction proposed by someone else", () => {
    expect(canReviewCorrection(corr)).toBe(true);
  });
  it("is false for a viewer who cannot review, a decided correction, or the proposer", () => {
    expect(canReviewCorrection({ ...corr, canReview: false })).toBe(false);
    for (const reviewStatus of ["approved", "rejected", "x"]) expect(canReviewCorrection({ ...corr, reviewStatus })).toBe(false);
    expect(canReviewCorrection({ ...corr, proposedBy: "u-mgr" })).toBe(false);
  });
});

describe("parseDecision", () => {
  it("accepts approve and reject and nothing else", () => {
    expect(parseDecision("approve")).toBe("approve");
    expect(parseDecision("reject")).toBe("reject");
    for (const v of ["Approve", "", "yes", null, undefined, 1]) expect(parseDecision(v)).toBeNull();
  });
});

describe("cleanReason", () => {
  it("refuses a reject with no reason, however it is blank", () => {
    for (const v of ["", "   ", "\n\t", null, undefined, 7]) {
      expect(cleanReason("reject", v)).toEqual({ ok: false, error: "attendance_reason_required" });
    }
  });
  it("lets an approve go with no reason, as null", () => {
    expect(cleanReason("approve", "")).toEqual({ ok: true, reason: null });
    expect(cleanReason("approve", "  ")).toEqual({ ok: true, reason: null });
    expect(cleanReason("approve", null)).toEqual({ ok: true, reason: null });
  });
  it("trims a reason", () => {
    expect(cleanReason("reject", "  wrong date  ")).toEqual({ ok: true, reason: "wrong date" });
    expect(cleanReason("approve", " ok ")).toEqual({ ok: true, reason: "ok" });
  });
  it("accepts exactly 500 characters and refuses 501, for either decision", () => {
    expect(MAX_REASON).toBe(500);
    expect(cleanReason("reject", "a".repeat(500))).toEqual({ ok: true, reason: "a".repeat(500) });
    expect(cleanReason("reject", "a".repeat(501))).toEqual({ ok: false, error: "attendance_reason_long" });
    expect(cleanReason("approve", "a".repeat(501))).toEqual({ ok: false, error: "attendance_reason_long" });
  });
  it("counts the trimmed length", () => {
    expect(cleanReason("reject", ` ${"a".repeat(500)} `)).toEqual({ ok: true, reason: "a".repeat(500) });
  });
});

describe("reviewErrorCode", () => {
  it("maps 42501 to forbidden and 22023 to the reason message, for both kinds", () => {
    for (const kind of ["day", "correction"] as const) {
      expect(reviewErrorCode(kind, "42501")).toBe("attendance_forbidden");
      expect(reviewErrorCode(kind, "22023")).toBe("attendance_reason_required");
    }
  });
  it("maps 55000 to a different message for a day and for a correction", () => {
    expect(reviewErrorCode("day", "55000")).toBe("attendance_day_final");
    expect(reviewErrorCode("correction", "55000")).toBe("attendance_correction_stale");
  });
  it("maps anything else, including no code, to generic", () => {
    for (const code of ["28000", "XX000", "23505", "", undefined]) {
      expect(reviewErrorCode("day", code)).toBe("generic");
      expect(reviewErrorCode("correction", code)).toBe("generic");
    }
  });
});

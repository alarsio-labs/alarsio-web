import { describe, expect, it } from "vitest";
import { MAX_REVIEW_NOTE, canMarkReviewed, cleanReviewNote, reviewErrorCode } from "./review";

const base = { canReview: true, status: "submitted", authorId: "u-author", viewerId: "u-manager" };

describe("canMarkReviewed", () => {
  it("is true for a reviewer looking at a submitted report by someone else", () => {
    expect(canMarkReviewed(base)).toBe(true);
  });
  it("is false for a viewer who cannot review the site", () => {
    expect(canMarkReviewed({ ...base, canReview: false })).toBe(false);
  });
  it("is false for a report that is reviewed, a draft, or unknown", () => {
    for (const status of ["reviewed", "draft", "x"]) expect(canMarkReviewed({ ...base, status })).toBe(false);
  });
  it("is false for the viewer's own report", () => {
    expect(canMarkReviewed({ ...base, authorId: "u-manager" })).toBe(false);
  });
});

describe("cleanReviewNote", () => {
  it("trims, and turns blank into null", () => {
    expect(cleanReviewNote("  ok  ")).toBe("ok");
    expect(cleanReviewNote("   ")).toBeNull();
    expect(cleanReviewNote(null)).toBeNull();
    expect(cleanReviewNote(7)).toBeNull();
  });
  it("returns 'too_long' above the limit and accepts exactly the limit", () => {
    expect(cleanReviewNote("a".repeat(MAX_REVIEW_NOTE))).toBe("a".repeat(MAX_REVIEW_NOTE));
    expect(cleanReviewNote("a".repeat(MAX_REVIEW_NOTE + 1))).toBe("too_long");
  });
});

describe("reviewErrorCode", () => {
  it("maps 42501 to review_forbidden, 22023 to review_note_long, anything else to generic", () => {
    expect(reviewErrorCode("42501")).toBe("review_forbidden");
    expect(reviewErrorCode("22023")).toBe("review_note_long");
    expect(reviewErrorCode("28000")).toBe("generic");
    expect(reviewErrorCode(undefined)).toBe("generic");
  });
});

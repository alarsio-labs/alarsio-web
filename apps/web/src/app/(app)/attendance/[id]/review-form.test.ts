import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { renderStatic } from "@/test-support/render";
import { ReviewForm } from "./review-form";

const action = async () => {};
const out = renderStatic(h(ReviewForm, { action, fields: { day_id: "d1", org_id: "o1" }, label: "Reason" }));

// The action reads `decision` and `reason`; the restyle must not change what is sent.
describe("ReviewForm", () => {
  it("sends approve and reject as the decision, from two submit buttons", () => {
    expect(out).toContain('<button type="submit" class="ax-btn ax-btn-primary" name="decision" value="approve">Approve</button>');
    expect(out).toContain('<button type="submit" class="ax-btn ax-btn-secondary" name="decision" value="reject">Reject</button>');
  });

  it("carries the hidden fields and an optional reason box", () => {
    expect(out).toContain('name="day_id" value="d1"');
    expect(out).toContain('name="org_id" value="o1"');
    expect(out).toMatch(/<textarea name="reason"/);
    expect(out).not.toContain("required");
  });

  it("has no red button", () => {
    expect(out).not.toMatch(/red/);
  });
});

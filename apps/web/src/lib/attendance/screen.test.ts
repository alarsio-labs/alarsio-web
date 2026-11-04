import { describe, expect, it } from "vitest";
import { toneFor } from "@/lib/app/status";
import { correctionTag, dayTag } from "./screen";

describe("dayTag", () => {
  it("uses the Overview's words for each day state", () => {
    expect(dayTag("open")).toBe("Needs approval");
    expect(dayTag("rejected")).toBe("Sent back");
    expect(dayTag("approved")).toBe("Approved");
    expect(dayTag(null)).toBe("Not started");
  });

  it("puts a day waiting for a manager, or sent back, in red-deep and a day with nothing recorded in muted", () => {
    expect(toneFor(dayTag("open"))).toBe("action");
    expect(toneFor(dayTag("rejected"))).toBe("action");
    expect(toneFor(dayTag("approved"))).toBe("ink");
    expect(toneFor(dayTag(null))).toBe("muted");
  });
});

describe("correctionTag", () => {
  it("marks a waiting correction for approval, in red-deep", () => {
    expect(correctionTag("pending")).toBe("Needs approval");
    expect(toneFor(correctionTag("pending"))).toBe("action");
    expect(correctionTag("approved")).toBe("Approved");
    expect(correctionTag("rejected")).toBe("Rejected");
  });
});

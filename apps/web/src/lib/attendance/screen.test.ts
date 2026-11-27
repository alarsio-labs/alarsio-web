import { describe, expect, it } from "vitest";
import { toneFor } from "@/lib/app/status";
import { correctionTag, dayTag, ENTRY_MARK, headcount } from "./screen";

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

describe("headcount and marks", () => {
  it("counts a half day as present and leave as absent", () => {
    const entries = (["present", "half_day", "absent", "leave", "present"] as const).map((status) => ({ status }));
    expect(headcount(entries)).toEqual({ present: 3, absent: 2 });
    expect(headcount([])).toEqual({ present: 0, absent: 0 });
  });

  it("gives each status a mark and a tone", () => {
    expect(ENTRY_MARK.present).toEqual({ mark: "P", tone: "ink" });
    expect(ENTRY_MARK.half_day.mark).toBe("½");
    expect(ENTRY_MARK.absent.tone).toBe("attention");
  });
});

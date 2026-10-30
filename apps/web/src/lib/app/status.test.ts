import { describe, expect, it } from "vitest";
import { toneFor } from "./status";

describe("toneFor", () => {
  it("marks states that ask someone to act in red-deep", () => {
    for (const s of ["Needs approval", "Sent back", "Rejected", "Flagged", "Needs attention", "No rate", "Low stock"]) {
      expect(toneFor(s)).toBe("action");
    }
  });

  it("keeps settled states in ink", () => {
    for (const s of ["Approved", "Filed", "Reviewed", "Active", "On the server"]) expect(toneFor(s)).toBe("ink");
  });

  it("mutes states where nothing has happened yet", () => {
    for (const s of ["Draft", "None", "Not started", "Not filed"]) expect(toneFor(s)).toBe("muted");
  });

  it("ignores case and surrounding spaces", () => {
    expect(toneFor("  sent BACK ")).toBe("action");
  });
});

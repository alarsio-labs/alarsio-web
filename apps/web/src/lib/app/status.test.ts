import { describe, expect, it } from "vitest";
import { toneFor } from "./status";

describe("toneFor", () => {
  it("marks states that wait for someone in amber", () => {
    for (const s of ["Needs approval", "Sent back", "Waiting for a review"]) expect(toneFor(s)).toBe("action");
  });

  it("marks problems in red", () => {
    for (const s of ["Rejected", "Flagged", "Needs attention", "No rate", "Low stock", "Below zero"]) expect(toneFor(s)).toBe("attention");
  });

  it("keeps settled states green", () => {
    for (const s of ["Approved", "Filed", "Reviewed", "Active", "On the server"]) expect(toneFor(s)).toBe("ink");
  });

  it("mutes states where nothing has happened yet", () => {
    for (const s of ["Draft", "None", "Not started", "Not filed"]) expect(toneFor(s)).toBe("muted");
  });

  it("ignores case and surrounding spaces", () => {
    expect(toneFor("  sent BACK ")).toBe("action");
  });
});

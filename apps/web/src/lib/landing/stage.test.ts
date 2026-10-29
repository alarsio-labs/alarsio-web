import { describe, expect, it } from "vitest";
import { phaseOf, railOverflow, span, stageProgress } from "./stage";

describe("stageProgress", () => {
  it("is 0 when the stage top reaches the viewport top, and 1 when its bottom reaches the bottom", () => {
    // A 2800px stage in a 1000px viewport travels 1800px.
    expect(stageProgress(0, 2800, 1000)).toBe(0);
    expect(stageProgress(-900, 2800, 1000)).toBe(0.5);
    expect(stageProgress(-1800, 2800, 1000)).toBe(1);
  });

  it("stays inside 0 to 1 before and after the stage", () => {
    expect(stageProgress(400, 2800, 1000)).toBe(0);
    expect(stageProgress(-5000, 2800, 1000)).toBe(1);
  });

  it("does not divide by zero when the stage is no taller than the viewport", () => {
    expect(stageProgress(10, 800, 1000)).toBe(0);
    expect(stageProgress(-10, 800, 1000)).toBe(1);
  });
});

describe("phaseOf", () => {
  it("splits progress into equal phases and keeps 1 in the last one", () => {
    expect([0, 0.24, 0.25, 0.5, 0.99, 1].map((p) => phaseOf(p, 4))).toEqual([0, 0, 1, 2, 3, 3]);
  });

  it("picks exactly one of three chapters", () => {
    expect([0, 0.33, 0.34, 0.67, 1].map((p) => phaseOf(p, 3))).toEqual([0, 0, 1, 2, 2]);
  });
});

describe("span", () => {
  it("remaps a window of the progress to 0 to 1", () => {
    expect(span(0.1, 0.1, 0.85)).toBe(0);
    expect(span(0.85, 0.1, 0.85)).toBe(1);
    expect(span(0.475, 0.1, 0.85)).toBeCloseTo(0.5);
  });
});

describe("railOverflow", () => {
  it("moves the row by exactly the width that does not fit", () => {
    expect(railOverflow(2400, 1440)).toBe(960);
  });

  it("does not move a row that already fits", () => {
    expect(railOverflow(1200, 1440)).toBe(0);
  });
});

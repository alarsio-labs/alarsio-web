import { beforeAll, describe, expect, it } from "vitest";
import { PLATES, contours, heroField, type Draw } from "./plates";

// A canvas can be 0 px wide (a very short or 0x0 viewport shrinks the day-record slip
// to nothing). A plate must then return, not loop: the grid used to step by w / 8,
// which is 0, and froze the page ("Page Unresponsive" on alarsio.com).

const CAP = 100_000;

/** A 2D context that counts drawing calls and throws past CAP instead of hanging. */
function countingContext() {
  let calls = 0;
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {
        if (++calls > CAP) throw new Error(`more than ${CAP} drawing calls`);
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls: () => calls };
}

beforeAll(() => {
  // Node has no Path2D; the hero field only needs moveTo/lineTo on it.
  (globalThis as { Path2D?: unknown }).Path2D ??= class {
    moveTo() {}
    lineTo() {}
  };
});

const ALL: [string, Draw][] = [...Object.entries(PLATES), ["heroField", heroField], ["contours", contours]];
const SIZES: [number, number][] = [
  [0, 0],
  [0, 300],
  [300, 0],
  [0.4, 0.4],
  [1e-9, 500]
];

describe("landing plates at degenerate sizes", () => {
  for (const [name, draw] of ALL) {
    for (const [w, h] of SIZES) {
      it(`${name} returns at ${w}x${h}`, () => {
        const { ctx, calls } = countingContext();
        expect(() => draw(ctx, w, h, 0)).not.toThrow();
        expect(calls()).toBeLessThan(CAP);
      });
    }
  }

  it("still draws a normal-size plate", () => {
    const { ctx, calls } = countingContext();
    PLATES.site?.(ctx, 291, 198, 0);
    expect(calls()).toBeGreaterThan(10);
  });
});

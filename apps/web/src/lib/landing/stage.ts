// The scroll maths of the pinned stages (docs/DESIGN.md section 2), kept free of the
// DOM so it can be tested.

export const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

/** 0 to 1 over the remap window [from, to] of a parent progress. */
export const span = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));

/**
 * How far a pinned stage has scrolled: 0 when its top reaches the viewport top,
 * 1 when its bottom reaches the viewport bottom.
 */
export function stageProgress(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return clamp01(-top / travel);
}

/** Which of `count` equal phases a progress falls in; 1 stays in the last phase. */
export function phaseOf(p: number, count: number): number {
  return Math.min(count - 1, Math.floor(clamp01(p) * count));
}

/** How far the rail moves so its last card lands flush at the end: never negative. */
export function railOverflow(trackScrollWidth: number, viewportWidth: number): number {
  return Math.max(0, trackScrollWidth - viewportWidth);
}

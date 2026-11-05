"use client";

import { useEffect, useRef } from "react";
import { heroField } from "./plates";

// The site-grid field on its own, for the sign-in pages' dark panel. Drawn once, and
// again when its box changes. It used to redraw at 30 fps; at 4x CPU that blocked the
// sign-in and sign-up pages for seconds (Lighthouse), with no gain for the form.
export function FieldCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const fit = () => {
      // 1x, not retina: faint strokes gain nothing from it, and it is 4x fewer pixels.
      const w = c.clientWidth, h = c.clientHeight;
      c.width = Math.round(w);
      c.height = Math.round(h);
      const ctx = c.getContext("2d");
      if (ctx) heroField(ctx, w, h, 0);
    };
    fit();
    const boxes = new ResizeObserver(fit);
    boxes.observe(c);
    return () => boxes.disconnect();
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}

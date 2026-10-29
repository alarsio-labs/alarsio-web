"use client";

import { useEffect, useRef } from "react";
import { heroField } from "./plates";

// The drifting site-grid field on its own, for the sign-in pages' dark panel.
// It animates only while on screen and the tab is visible, and draws one still
// frame under reduced motion.
export function FieldCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let size = { w: 0, h: 0 };
    let ctx: CanvasRenderingContext2D | null = null;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: c.clientWidth, h: c.clientHeight };
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
      ctx = c.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ctx) heroField(ctx, size.w, size.h, 0);
    };
    fit();
    const boxes = new ResizeObserver(fit);
    boxes.observe(c);
    if (reduced) return () => boxes.disconnect();

    let on = true;
    const vis = new IntersectionObserver(([e]) => {
      on = e?.isIntersecting ?? false;
    });
    vis.observe(c);
    let raf = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (on && !document.hidden && ctx) heroField(ctx, size.w, size.h, ms / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      vis.disconnect();
      boxes.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}

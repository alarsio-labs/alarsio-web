"use client";

import { useEffect } from "react";
import { DAY_RECORD } from "@/lib/landing/content";
import { phaseOf, railOverflow, span, stageProgress } from "@/lib/landing/stage";
import { PLATES, contours, heroField, type Draw } from "./plates";

// The landing page's one scroll driver (docs/DESIGN.md section 2). It writes custom
// properties on :root and touches DOM text only when a phase index changes. Without
// it, or under reduced motion, the page is complete and still.
export function LandingMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // Canvases: size to the box at DPR up to 2; animate only while on screen and the tab is visible.
    const sizeCanvas = (c: HTMLCanvasElement) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w, h };
    };
    const stills = [...document.querySelectorAll<HTMLCanvasElement>("canvas[data-plate]")];
    const drawStill = (c: HTMLCanvasElement) => {
      const draw = PLATES[c.dataset.plate ?? ""];
      const { ctx, w, h } = sizeCanvas(c);
      if (ctx && draw) draw(ctx, w, h, 0);
    };
    const drawStills = () => stills.forEach(drawStill);
    drawStills();
    // A plate's box can change without a window resize (a printed row wraps), so
    // each still canvas is redrawn when its own box changes, never stretched.
    const boxes = new ResizeObserver((entries) => entries.forEach((e) => drawStill(e.target as HTMLCanvasElement)));
    stills.forEach((c) => boxes.observe(c));
    cleanups.push(() => boxes.disconnect());

    const live: { c: HTMLCanvasElement; draw: Draw; on: boolean }[] = [];
    for (const [sel, draw] of [["canvas[data-live=hero]", heroField], ["canvas[data-live=contours]", contours]] as const) {
      const c = document.querySelector<HTMLCanvasElement>(sel);
      if (c) live.push({ c, draw, on: false });
    }
    let sized = live.map((l) => sizeCanvas(l.c));
    live.forEach((l, i) => {
      const s = sized[i];
      if (s?.ctx) l.draw(s.ctx, s.w, s.h, 0);
    });

    // Reassigned below once motion is on; under reduced motion a resize only redraws.
    let measure = () => {};
    let schedule = () => {};
    const onResize = () => {
      drawStills();
      sized = live.map((l) => sizeCanvas(l.c));
      live.forEach((l, i) => {
        const s = sized[i];
        if (s?.ctx) l.draw(s.ctx, s.w, s.h, 0);
      });
      measure();
      schedule();
    };
    window.addEventListener("resize", onResize);
    cleanups.push(() => window.removeEventListener("resize", onResize));

    if (reduced) return () => cleanups.forEach((f) => f());
    root.classList.add("lp-motion");
    cleanups.push(() => root.classList.remove("lp-motion"));

    // Reveal: one observer, unobserve on entry.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll("[data-rev]").forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    const vis = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const l = live.find((x) => x.c === e.target);
        if (l) l.on = e.isIntersecting;
      }
    });
    live.forEach((l) => vis.observe(l.c));
    cleanups.push(() => vis.disconnect());

    let raf = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      live.forEach((l, i) => {
        const s = sized[i];
        if (l.on && s?.ctx) l.draw(s.ctx, s.w, s.h, ms / 1000);
      });
    };
    raf = requestAnimationFrame(loop);
    cleanups.push(() => cancelAnimationFrame(raf));

    // Stages.
    const stage = (name: string) => document.querySelector<HTMLElement>(`[data-stage=${name}]`);
    const hero = stage("hero"), manifesto = stage("manifesto"), rail = stage("rail"), record = stage("record"), wages = stage("wages");
    const track = document.querySelector<HTMLElement>("[data-rail-track]");
    const cues = [...document.querySelectorAll<HTMLElement>("[data-cue]")];
    const status = document.querySelector<HTMLElement>("[data-status]");
    const rowValues = [...document.querySelectorAll<HTMLElement>("[data-row-value]")];
    const chapters = [...document.querySelectorAll<HTMLElement>("[data-chapter]")];
    let overflow = 0;
    measure = () => {
      // clientWidth, not innerWidth: the scrollbar is not room the last card can use.
      overflow = track ? railOverflow(track.scrollWidth, document.documentElement.clientWidth) : 0;
    };
    measure();

    const progress = (el: HTMLElement | null) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return stageProgress(r.top, r.height, window.innerHeight);
    };
    const set = (k: string, v: string) => root.style.setProperty(k, v);

    let phase = -1;
    let chapter = -1;
    const applyPhase = (p: number) => {
      cues.forEach((c, i) => c.classList.toggle("is-on", i <= p));
      if (status) status.textContent = DAY_RECORD.status[p] ?? "";
      rowValues.forEach((el) => {
        const row = DAY_RECORD.rows[Number(el.dataset.rowValue)];
        el.textContent = row?.values[p] ?? "";
      });
    };

    let ticking = false;
    const frame = () => {
      ticking = false;
      const doc = document.documentElement;
      set("--page-p", String(window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)));

      const ph = progress(hero);
      set("--hero-type-y", `${(-90 * span(ph, 0, 0.8)).toFixed(2)}px`);
      set("--hero-type-scale", (1 - 0.26 * span(ph, 0.1, 0.9)).toFixed(4));
      set("--hero-type-alpha", (1 - span(ph, 0.35, 0.9)).toFixed(4));
      set("--hero-meta-alpha", (1 - span(ph, 0, 0.4)).toFixed(4));

      const pm = progress(manifesto);
      set("--manifesto-wipe", `${(100 * span(pm, 0.08, 0.85)).toFixed(2)}%`);
      set("--manifesto-scale", (1 + 0.05 * pm).toFixed(4));

      const pr = progress(rail);
      set("--rail-x", `${(-pr * overflow).toFixed(1)}px`);
      set("--rail-p", pr.toFixed(4));

      const pk = progress(record);
      set("--packet-alpha", span(pk, 0, 0.12).toFixed(4));
      set("--packet-enter", `${(38 * (1 - span(pk, 0, 0.22))).toFixed(2)}px`);
      set("--packet-scale", (0.78 + 0.22 * span(pk, 0, 0.28)).toFixed(4));
      set("--packet-cut", span(pk, 0.84, 0.98).toFixed(4));
      set("--packet-meter", pk.toFixed(4));
      set("--packet-copy-x", `${(-28 * span(pk, 0, 0.3)).toFixed(2)}px`);
      const nextPhase = phaseOf(span(pk, 0.18, 0.82), DAY_RECORD.status.length);
      if (nextPhase !== phase) {
        phase = nextPhase;
        applyPhase(phase);
      }

      const pw = progress(wages);
      set("--season-y", `${(-4 + 8 * pw).toFixed(3)}%`);
      set("--season-scale", (1.1 - 0.045 * pw).toFixed(4));
      const nextChapter = phaseOf(pw, chapters.length || 1);
      if (nextChapter !== chapter) {
        chapter = nextChapter;
        chapters.forEach((c, i) => c.classList.toggle("is-on", i === chapter));
      }
    };
    schedule = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(frame);
    };
    frame();
    window.addEventListener("scroll", schedule, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", schedule));

    return () => cleanups.forEach((f) => f());
  }, []);

  return null;
}

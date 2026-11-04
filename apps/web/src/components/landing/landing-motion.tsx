"use client";

import { useEffect } from "react";
import { DAY_RECORD } from "@/lib/landing/content";
import { phaseOf, railOverflow, span, stageProgress } from "@/lib/landing/stage";
import { PLATES, contours, heroField, type Draw } from "./plates";

// The landing page's one scroll driver (docs/DESIGN.md section 2). It writes each
// stage's custom properties on that stage, only when they change, and touches DOM
// text only when a phase index changes. Without it, or under reduced motion, the
// page is complete and still.
export function LandingMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // Canvases: size to the box (still plates at DPR up to 2, the live fields at 1:
    // faint strokes gain nothing from retina, and it is 4x fewer pixels a frame).
    // Live fields animate only on screen, with the tab visible, at about 30 fps.
    const sizeCanvas = (c: HTMLCanvasElement, maxDpr = 2) => {
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
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
    let sized = live.map((l) => sizeCanvas(l.c, 1));
    live.forEach((l, i) => {
      const s = sized[i];
      if (s?.ctx) l.draw(s.ctx, s.w, s.h, 0);
    });

    // Reassigned below once motion is on; under reduced motion a resize only redraws.
    let measure = () => {};
    let schedule = () => {};
    const onResize = () => {
      drawStills();
      sized = live.map((l) => sizeCanvas(l.c, 1));
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

    // The live fields are decoration: they pause while the page scrolls, so a scroll
    // frame never waits behind a canvas redraw (on a slow or busy laptop the two
    // together dropped scrolling to about 16 fps), and resume 200 ms after it stops.
    let lastScroll = -Infinity;
    let raf = 0;
    let lastDraw = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || ms - lastDraw < 32 || performance.now() - lastScroll < 200) return;
      lastDraw = ms;
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

    // Each variable is written only on the elements whose CSS reads it (USES below),
    // not on the whole stage: a custom property inherits, so a write on the stage made
    // the browser restyle every element inside it on every scroll frame. It is written
    // only when the value changed, and only while the stage is within a screen of the
    // viewport. All boxes are read once at the top of a frame, before any write:
    // reading a box after a style write forces the browser to lay the page out again.
    type Box = { near: boolean; p: number };
    const box = (el: HTMLElement | null, vh: number): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { near: r.bottom > -vh && r.top < 2 * vh, p: stageProgress(r.top, r.height, vh) };
    };
    // Variable -> the elements (inside its stage) whose rules in landing.css read it.
    const USES: Record<string, [HTMLElement | null, string]> = {
      "--hero-type-y": [hero, ".lp-lockup"],
      "--hero-type-scale": [hero, ".lp-lockup"],
      "--hero-type-alpha": [hero, ".lp-lockup"],
      "--hero-meta-alpha": [hero, ".lp-hero-meta"],
      "--manifesto-wipe": [manifesto, ".lp-man-fill"],
      "--manifesto-scale": [manifesto, ".lp-man-box"],
      "--rail-x": [rail, ".lp-track"],
      "--rail-p": [rail, ".lp-meter"],
      "--packet-alpha": [record, ".lp-packet"],
      "--packet-enter": [record, ".lp-packet"],
      "--packet-scale": [record, ".lp-packet"],
      "--packet-cut": [record, ".lp-packet-stub, .lp-perf, .lp-tear"],
      "--packet-meter": [record, ".lp-meter"],
      "--packet-copy-x": [record, ".lp-rec-copy"],
      "--season-y": [wages, "canvas"],
      "--season-scale": [wages, "canvas"]
    };
    const targets = new Map<string, HTMLElement[]>();
    for (const [k, [scope, sel]] of Object.entries(USES)) {
      targets.set(k, scope ? [...scope.querySelectorAll<HTMLElement>(sel)] : []);
    }
    const written = new Map<string, string>();
    const set = (k: string, v: string) => {
      if (written.get(k) === v) return;
      written.set(k, v);
      for (const el of targets.get(k) ?? []) el.style.setProperty(k, v);
    };

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

      // Reads first.
      const vh = window.innerHeight;
      const bh = box(hero, vh), bm = box(manifesto, vh), br = box(rail, vh), bk = box(record, vh), bw = box(wages, vh);

      // Then writes.
      if (hero && bh?.near) {
        const ph = bh.p;
        set("--hero-type-y", `${(-90 * span(ph, 0, 0.8)).toFixed(1)}px`);
        set("--hero-type-scale", (1 - 0.26 * span(ph, 0.1, 0.9)).toFixed(3));
        set("--hero-type-alpha", (1 - span(ph, 0.35, 0.9)).toFixed(3));
        set("--hero-meta-alpha", (1 - span(ph, 0, 0.4)).toFixed(3));
      }

      if (manifesto && bm?.near) {
        const pm = bm.p;
        set("--manifesto-wipe", `${(100 * span(pm, 0.08, 0.85)).toFixed(1)}%`);
        set("--manifesto-scale", (1 + 0.05 * pm).toFixed(3));
      }

      if (rail && br?.near) {
        const pr = br.p;
        set("--rail-x", `${(-pr * overflow).toFixed(1)}px`);
        set("--rail-p", pr.toFixed(3));
      }

      if (record && bk?.near) {
        const pk = bk.p;
        set("--packet-alpha", span(pk, 0, 0.12).toFixed(3));
        set("--packet-enter", `${(38 * (1 - span(pk, 0, 0.22))).toFixed(1)}px`);
        set("--packet-scale", (0.78 + 0.22 * span(pk, 0, 0.28)).toFixed(3));
        set("--packet-cut", span(pk, 0.84, 0.98).toFixed(3));
        set("--packet-meter", pk.toFixed(3));
        set("--packet-copy-x", `${(-28 * span(pk, 0, 0.3)).toFixed(1)}px`);
        const nextPhase = phaseOf(span(pk, 0.18, 0.82), DAY_RECORD.status.length);
        if (nextPhase !== phase) {
          phase = nextPhase;
          applyPhase(phase);
        }
      }

      if (wages && bw?.near) {
        const pw = bw.p;
        set("--season-y", `${(-4 + 8 * pw).toFixed(2)}%`);
        set("--season-scale", (1.1 - 0.045 * pw).toFixed(4));
        const nextChapter = phaseOf(pw, chapters.length || 1);
        if (nextChapter !== chapter) {
          chapter = nextChapter;
          chapters.forEach((c, i) => c.classList.toggle("is-on", i === chapter));
        }
      }
    };
    schedule = () => {
      lastScroll = performance.now();
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

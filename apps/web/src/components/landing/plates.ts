// Generated plates for the landing page: flat print-style drawings on canvas, no
// images (docs/DESIGN.md). Each function draws one frame for a time `t` in seconds.

export const INK = "#171717";
export const RED = "#ef493c";
const HAIR = "rgba(23,23,23,.16)";

export type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** Stage 1: short red strokes on a site grid, drifting on sines of time and index.
 *  Strokes are grouped into BUCKETS alpha levels and drawn as one path per level:
 *  about 1000 stroke() calls a frame became 8 (Firefox stalled on the former). */
const BUCKETS = 8;
const paths: Path2D[] = [];
export const heroField: Draw = (ctx, w, h, t) => {
  ctx.clearRect(0, 0, w, h);
  const gap = Math.max(22, Math.min(w, h) / 22);
  const cols = Math.ceil(w / gap) + 1;
  const rows = Math.ceil(h / gap) + 1;
  for (let b = 0; b < BUCKETS; b++) paths[b] = new Path2D();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const level = 0.5 + 0.5 * Math.sin(t * 0.6 + i * 0.37);
      const ang = Math.sin(t * 0.25 + c * 0.21 + r * 0.13) * 0.5;
      const len = gap * (0.28 + 0.12 * Math.sin(t * 0.4 + i));
      const x = c * gap + Math.sin(t * 0.3 + r) * 2;
      const y = r * gap;
      const path = paths[Math.min(BUCKETS - 1, Math.floor(level * BUCKETS))];
      path?.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
      path?.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    }
  }
  ctx.lineCap = "square";
  ctx.lineWidth = 1.5;
  for (let b = 0; b < BUCKETS; b++) {
    const path = paths[b];
    if (!path) continue;
    ctx.strokeStyle = `rgba(239,73,60,${(0.05 + 0.14 * ((b + 0.5) / BUCKETS)).toFixed(3)})`;
    ctx.stroke(path);
  }
};

/** Stage 5: 22 stacked contour lines, a sine plus a slower harmonic; every fifth red. */
export const contours: Draw = (ctx, w, h, t) => {
  ctx.clearRect(0, 0, w, h);
  const n = 22;
  for (let k = 0; k < n; k++) {
    const base = (h / (n + 1)) * (k + 1);
    ctx.strokeStyle = k % 5 === 4 ? RED : HAIR;
    ctx.lineWidth = k % 5 === 4 ? 1.5 : 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = base + Math.sin(x / 140 + k * 0.4 + t * 0.15) * 14 + Math.sin(x / 520 + k * 0.17 - t * 0.05) * 26;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

function frame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e7e2d8";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += w / 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += w / 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** The six rail plates and the day record's site plate, all still. */
export const PLATES: Record<string, Draw> = {
  checkin: (ctx, w, h) => {
    frame(ctx, w, h);
    const cx = w / 2, cy = h * 0.52, r = w * 0.34;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(cx + r * 0.22, cy - r * 0.18, 6, 0, Math.PI * 2);
    ctx.fill();
  },
  register: (ctx, w, h) => {
    frame(ctx, w, h);
    const rows = 9, cols = 6, px = w * 0.14, py = h * 0.14;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = px + (c * (w - 2 * px)) / (cols - 1);
        const y = py + (r * (h - 2 * py)) / (rows - 1);
        const odd = (r * 7 + c * 3) % 11 === 0;
        ctx.strokeStyle = odd ? RED : INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x - 2, y + 4);
        ctx.lineTo(x + 6, y - 5);
        ctx.stroke();
      }
    }
  },
  report: (ctx, w, h) => {
    frame(ctx, w, h);
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(w * 0.14, h * 0.1, w * 0.72, h * 0.8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(w * 0.14, h * 0.1, w * 0.72, h * 0.8);
    ctx.strokeStyle = RED;
    ctx.beginPath();
    ctx.moveTo(w * 0.26, h * 0.1);
    ctx.lineTo(w * 0.26, h * 0.9);
    ctx.stroke();
    ctx.strokeStyle = HAIR;
    for (let y = h * 0.2; y < h * 0.86; y += h * 0.06) {
      ctx.beginPath();
      ctx.moveTo(w * 0.3, y);
      ctx.lineTo(w * (0.5 + 0.3 * ((y * 13) % 7) / 7), y);
      ctx.stroke();
    }
  },
  materials: (ctx, w, h) => {
    frame(ctx, w, h);
    const bars = [0.62, 0.48, 0.34, 0.2, 0.12];
    const bw = (w * 0.66) / bars.length;
    bars.forEach((b, i) => {
      const x = w * 0.17 + i * bw;
      const top = h * (0.86 - b);
      ctx.fillStyle = i === bars.length - 1 ? RED : INK;
      ctx.fillRect(x + 4, top, bw - 8, h * b);
    });
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.86);
    ctx.lineTo(w * 0.88, h * 0.86);
    ctx.stroke();
  },
  overview: (ctx, w, h) => {
    frame(ctx, w, h);
    const n = 3, pad = w * 0.14, gap = 10;
    const cell = (w - 2 * pad - gap * (n - 1)) / n;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < n; c++) {
        const x = pad + c * (cell + gap);
        const y = h * 0.14 + r * (cell + gap);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, cell, cell);
        if ((r + c) % 3 === 0) {
          ctx.fillStyle = INK;
          ctx.fillRect(x + 6, y + 6, cell - 12, cell - 12);
        }
        if (r === 1 && c === 2) {
          ctx.fillStyle = RED;
          ctx.fillRect(x + 6, y + 6, cell - 12, cell - 12);
        }
      }
    }
  },
  wages: (ctx, w, h) => {
    frame(ctx, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    // A staircase: each approved day adds a step to the period's total.
    const steps = 7;
    const run = (w * 0.72) / steps;
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const x = w * 0.14 + i * run;
      const y = h * (0.82 - 0.09 * i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      ctx.lineTo(x + run, y);
    }
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.fillRect(w * 0.8, h * 0.16, 10, 10);
  },
  site: (ctx, w, h) => {
    frame(ctx, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(w * 0.18, h * 0.2, w * 0.5, h * 0.42);
    ctx.strokeRect(w * 0.56, h * 0.48, w * 0.26, h * 0.3);
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(w * 0.48, h * 0.48, w * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(w * 0.42, h * 0.4, 6, 0, Math.PI * 2);
    ctx.fill();
  }
};

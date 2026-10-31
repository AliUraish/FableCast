// Drawing primitives. Names and semantics follow khan-explainer's renderer (MIT, see THIRD_PARTY.md):
// `p` runs 0..1 while a line is spoken, and seg(p, from, to) orders strokes inside it.
// Re-implemented in TypeScript; no code copied.
import type { ColorName } from "@/lib/schemas";
import { partial, jitter } from "./flatten";
import { applyInk, bg, fg, inkFill } from "./themes";
import type { Ctx, InkCtx, Pt, Rect } from "./types";

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** A slice of p: 0 before `from`, 1 after `to`, linear between. */
export const seg = (p: number, from: number, to: number) => clamp01((p - from) / Math.max(1e-6, to - from));
export const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export interface StrokeOpts {
  ink: InkCtx;
  color?: ColorName; // ink token -> line style
  width?: number; // base px width (default 3)
  seed?: string; // jitter seed; omit for a perfectly clean line
  wobble?: number; // 0..1.5, adds to the base jitter
  fill?: ColorName | "bg" | null; // fill the closed shape when fully drawn: token pattern, or "bg" to occlude
  occlude?: boolean; // fill with the paper colour first so things behind are hidden
  alpha?: number;
}

const BASE_AMP = 1.1;

/** Draw a polyline progressively up to fraction p of its length. */
export function stroke(ctx: Ctx, pts: Pt[], p: number, o: StrokeOpts): void {
  if (p <= 0 || pts.length < 2) return;
  const amp = o.ink.reducedMotion || !o.seed ? 0 : BASE_AMP + (o.wobble ?? 0) * 2.2;
  const jp = o.seed ? jitter(pts, o.seed, amp) : pts;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (p >= 1 && (o.fill || o.occlude)) {
    ctx.beginPath();
    tracePath(ctx, jp);
    ctx.closePath();
    if (o.occlude || o.fill === "bg") {
      ctx.fillStyle = bg(o.ink.theme);
      ctx.fill();
    }
    if (o.fill && o.fill !== "bg") {
      const f = inkFill(ctx, o.fill, o.ink);
      if (f) {
        ctx.fillStyle = f;
        ctx.fill();
      }
    }
  }
  const part = partial(jp, p);
  const style = applyInk(ctx, o.color, o.ink, o.width ?? 3);
  ctx.beginPath();
  tracePath(ctx, part);
  ctx.stroke();
  if (style.double) {
    const off = Math.max(2.5, (o.width ?? 3) * 1.4);
    ctx.translate(off * 0.7, off * 0.7);
    ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.6);
    ctx.beginPath();
    tracePath(ctx, part);
    ctx.stroke();
  }
  ctx.restore();
}

function tracePath(ctx: Ctx, pts: Pt[]) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

/** Draw several polylines in order, sharing one p (each gets an equal slice). */
export function strokeAll(ctx: Ctx, paths: Pt[][], p: number, o: StrokeOpts): void {
  const n = paths.length;
  paths.forEach((pts, i) => stroke(ctx, pts, seg(p, i / n, (i + 1) / n), { ...o, seed: o.seed ? `${o.seed}:${i}` : undefined }));
}

// ---------- point-list builders ----------
export function line(a: Pt, b: Pt, n = 8): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
  return pts;
}

/** Quadratic curve a -> b bent by control point c. */
export function curve(a: Pt, c: Pt, b: Pt, n = 18): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

/** Ellipse starting at the top, going clockwise; `turns` > 1 overshoots like a hand-drawn ring. */
export function oval(cx: number, cy: number, rx: number, ry: number, n = 44, turns = 1, start = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  const steps = Math.round(n * turns);
  for (let i = 0; i <= steps; i++) {
    const a = start + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

export function box(x: number, y: number, w: number, h: number): Pt[] {
  return [
    ...line([x, y], [x + w, y], 6),
    ...line([x + w, y], [x + w, y + h], 6).slice(1),
    ...line([x + w, y + h], [x, y + h], 6).slice(1),
    ...line([x, y + h], [x, y], 6).slice(1),
  ];
}

/** Oval around a rect (hand-drawn ring, slight overshoot). */
export function ring(r: Rect, pad = 12): Pt[] {
  return oval(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + pad, r.h / 2 + pad, 48, 1.08, -Math.PI * 0.6);
}

/** Frame around a rect. */
export function around(r: Rect, pad = 10): Pt[] {
  return box(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
}

export function arrow(ctx: Ctx, from: Pt, to: Pt, p: number, o: StrokeOpts & { ctrl?: Pt }): void {
  const c: Pt = o.ctrl ?? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const body = curve(from, c, to);
  stroke(ctx, body, seg(p, 0, 0.8), o);
  const ang = Math.atan2(to[1] - c[1], to[0] - c[0]);
  const L = 16;
  const h1: Pt = [to[0] - L * Math.cos(ang - 0.45), to[1] - L * Math.sin(ang - 0.45)];
  const h2: Pt = [to[0] - L * Math.cos(ang + 0.45), to[1] - L * Math.sin(ang + 0.45)];
  stroke(ctx, [h1, to, h2], seg(p, 0.8, 1), o);
}

export function check(ctx: Ctx, x: number, y: number, p: number, o: StrokeOpts & { size?: number }): void {
  const s = o.size ?? 30;
  stroke(ctx, [[x - s * 0.5, y], [x - s * 0.15, y + s * 0.4], [x + s * 0.6, y - s * 0.5]], p, o);
}

/** Sparkle burst: a few short strokes radiating from a point. */
export function sparkle(ctx: Ctx, x: number, y: number, r: number, p: number, o: StrokeOpts): void {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const q = seg(p, i / (n + 2), (i + 3) / (n + 2));
    stroke(ctx, line([x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45], [x + Math.cos(a) * r, y + Math.sin(a) * r], 3), q, o);
  }
}

/**
 * Pen-writing reveal of text, letter by letter, in Geist Pixel. Used ONLY for page titles and THE END.
 * `y` is the baseline.
 */
export function write(
  ctx: Ctx, str: string, x: number, y: number, p: number,
  o: { ink: InkCtx; size?: number; center?: boolean; family?: string; alpha?: number },
): void {
  if (p <= 0) return;
  const size = o.size ?? 48;
  const shown = str.slice(0, Math.ceil(clamp01(p) * str.length));
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.font = `500 ${size}px ${o.family ?? "monospace"}`;
  ctx.fillStyle = fg(o.ink.theme);
  ctx.textBaseline = "alphabetic";
  const full = ctx.measureText(str).width;
  ctx.textAlign = "left";
  ctx.fillText(shown, o.center ? x - full / 2 : x, y);
  ctx.restore();
}

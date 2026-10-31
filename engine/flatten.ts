// Path -> cached polyline, plus seeded hand-drawn jitter. Pure TS so it runs in Node tests too
// (no SVGPathElement needed). Input paths must already be sanitised (absolute M L C Q Z only).
import type { Pt } from "./types";

const cache = new Map<string, Pt[][]>();

/** Parse a sanitised path into subpaths of sampled points (in the path's own units). */
export function flattenPath(d: string): Pt[][] {
  const hit = cache.get(d);
  if (hit) return hit;
  const toks = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let i = 0;
  let pen: Pt = [0, 0];
  let start: Pt = [0, 0];
  let cmd = "M";
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/^[MLCQZ]$/i.test(toks[i])) cmd = toks[i++].toUpperCase();
    if (cmd === "Z") {
      cur.push([start[0], start[1]]);
      pen = start;
      cmd = "M";
      continue;
    }
    if (i >= toks.length) break;
    if (cmd === "M") {
      if (cur.length > 1) out.push(cur);
      pen = [num(), num()];
      start = pen;
      cur = [pen];
      cmd = "L";
    } else if (cmd === "L") {
      const p: Pt = [num(), num()];
      cur.push(...sampleLine(pen, p));
      pen = p;
    } else if (cmd === "Q") {
      const c: Pt = [num(), num()];
      const p: Pt = [num(), num()];
      for (let s = 1; s <= 14; s++) {
        const t = s / 14, u = 1 - t;
        cur.push([u * u * pen[0] + 2 * u * t * c[0] + t * t * p[0], u * u * pen[1] + 2 * u * t * c[1] + t * t * p[1]]);
      }
      pen = p;
    } else if (cmd === "C") {
      const c1: Pt = [num(), num()];
      const c2: Pt = [num(), num()];
      const p: Pt = [num(), num()];
      for (let s = 1; s <= 18; s++) {
        const t = s / 18, u = 1 - t;
        cur.push([
          u * u * u * pen[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p[0],
          u * u * u * pen[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p[1],
        ]);
      }
      pen = p;
    } else {
      i++;
    }
  }
  if (cur.length > 1) out.push(cur);
  const clean = out.filter((s) => s.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  cache.set(d, clean);
  return clean;
}

function sampleLine(a: Pt, b: Pt): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.min(12, Math.round(len / 8)));
  const pts: Pt[] = [];
  for (let s = 1; s <= n; s++) pts.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  return pts;
}

export function polyLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** First fraction p (by length) of a polyline. */
export function partial(pts: Pt[], p: number): Pt[] {
  if (p >= 1) return pts;
  if (p <= 0 || pts.length < 2) return [];
  const target = polyLength(pts) * p;
  const out: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const segL = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + segL >= target) {
      const k = segL ? (target - acc) / segL : 0;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
      return out;
    }
    acc += segL;
    out.push(pts[i]);
  }
  return out;
}

// ---------- seeded noise ----------
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random in [-1, 1] for (seed, integer i). */
export function rand(seed: number, i: number): number {
  let x = (seed ^ Math.imul(i + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967295) * 2 - 1;
}

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return rand(seed, i) * (1 - s) + rand(seed, i + 1) * s;
}

/** Hand-drawn wobble: offset each point by smooth noise along its arc length. Same seed -> same pixels. */
export function jitter(pts: Pt[], seed: string, amp: number): Pt[] {
  if (amp <= 0 || pts.length < 2) return pts;
  const a = hashSeed(seed);
  const b = hashSeed(seed + "#y");
  const out: Pt[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    out.push([pts[i][0] + amp * noise1(a, s / 38), pts[i][1] + amp * noise1(b, s / 38)]);
  }
  return out;
}

/** Map a polyline from a local box (0..100) into a target rect. */
export function mapBox(pts: Pt[], x: number, y: number, w: number, h: number): Pt[] {
  return pts.map(([px, py]) => [x + (px / 100) * w, y + (py / 100) * h]);
}

/** Transform points: scale about origin, rotate, translate. */
export function xform(pts: Pt[], tx: number, ty: number, rot = 0, sx = 1, sy = sx): Pt[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.map(([x, y]) => {
    const X = x * sx, Y = y * sy;
    return [tx + X * c - Y * s, ty + X * s + Y * c];
  });
}

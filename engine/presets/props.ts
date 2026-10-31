// Hand-made prop presets, drawn in a 0..100 local box mapped onto the prop's rect (readme 6.6).
// Simple silhouettes are a feature: the sketch style hides imperfections.
import type { ColorName, Prop, PropPreset } from "@/lib/schemas";
import { flattenPath, mapBox, polyLength } from "../flatten";
import { clamp01, curve, line, oval, seg, stroke } from "../primitives";
import { sanitizePath } from "../sanitize";
import { toBoard, type Board, type Ctx, type InkCtx, type Pt, type Rect } from "../types";

/** One stroke of a drawing. Parts draw in order; `p` is shared out by length. */
export interface Part {
  name: string;
  pts: Pt[];
  color?: ColorName;
  width?: number; // multiplier of the base width passed to drawParts
  fill?: ColorName | "bg" | null;
  occlude?: boolean;
  alpha?: number;
}

/** Draw parts in order, sharing p by stroke length (so long strokes take longer, like a real pen). */
export function drawParts(ctx: Ctx, parts: Part[], p: number, o: { ink: InkCtx; seed: string; width?: number; alpha?: number }): void {
  if (p <= 0 || !parts.length) return;
  const lens = parts.map((pt) => Math.max(1, polyLength(pt.pts)));
  const total = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < parts.length; i++) {
    const a = acc / total;
    acc += lens[i];
    const q = seg(p, a, acc / total);
    if (q <= 0) break;
    const part = parts[i];
    stroke(ctx, part.pts, q, {
      ink: o.ink,
      color: part.color,
      width: (part.width ?? 1) * (o.width ?? 3),
      seed: `${o.seed}:${part.name}`,
      fill: part.fill ?? null,
      occlude: part.occlude,
      alpha: (part.alpha ?? 1) * (o.alpha ?? 1),
    });
  }
}

// ---------- local-box helpers (0..100) ----------
/** Polyline through points, densified so jitter reads as hand-drawn. */
export function poly(...pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) out.push(...line(pts[i - 1], pts[i], 5).slice(1));
  return out;
}
export const closed = (...pts: Pt[]): Pt[] => poly(...pts, pts[0]);
/** Join point lists end to end (drops duplicated joints). */
export function join(...lists: Pt[][]): Pt[] {
  const out: Pt[] = [];
  for (const l of lists) out.push(...(out.length ? l.slice(1) : l));
  return out;
}
/** Wobbly blob: an oval whose radius bumps `bumps` times. */
export function bumpy(cx: number, cy: number, rx: number, ry: number, bumps: number, amt: number, n = 72): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const k = 1 + amt * Math.abs(Math.sin((a * bumps) / 2));
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

interface Preset {
  aspect: number; // width / height
  grounded: boolean; // anchor effects at the bottom centre
  parts: (a: number) => Part[];
}

// Circles in a non-square box: divide the x radius by the aspect so they stay round.
const circ = (cx: number, cy: number, r: number, a: number, n = 36) => oval(cx, cy, r / a, r, n);

const PRESETS: Record<PropPreset, Preset> = {
  moon: {
    aspect: 1, grounded: false,
    parts: () => {
      const outer: Pt[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = ((300 - (i * 240) / 40) * Math.PI) / 180;
        outer.push([50 + 45 * Math.cos(a), 50 + 45 * Math.sin(a)]);
      }
      return [
        { name: "crescent", pts: join(outer, curve([72.5, 89], [2, 50], [72.5, 11])), occlude: true },
        { name: "crater", pts: oval(26, 58, 4, 5, 18), width: 0.6 },
      ];
    },
  },
  sun: {
    aspect: 1, grounded: false,
    parts: () => {
      const rays: Part[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        rays.push({ name: `ray${i}`, pts: line([50 + Math.cos(a) * 33, 50 + Math.sin(a) * 33], [50 + Math.cos(a) * 47, 50 + Math.sin(a) * 47], 4) });
      }
      return [{ name: "disc", pts: oval(50, 50, 25, 25, 40), occlude: true }, ...rays];
    },
  },
  star: {
    aspect: 1, grounded: false,
    parts: () => {
      const pts: Pt[] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? 20 : 48;
        pts.push([50 + Math.cos(a) * r, 52 + Math.sin(a) * r]);
      }
      return [{ name: "star", pts: closed(...pts), occlude: true }];
    },
  },
  tree: {
    aspect: 0.8, grounded: true,
    parts: () => [
      { name: "trunkL", pts: poly([42, 100], [45, 60]) },
      { name: "trunkR", pts: poly([58, 100], [55, 60]) },
      { name: "canopy", pts: bumpy(50, 38, 44, 34, 7, 0.08), occlude: true, fill: "blue" },
      { name: "branch", pts: curve([50, 84], [54, 78], [62, 76], 8), width: 0.7 },
    ],
  },
  house: {
    aspect: 0.9, grounded: true,
    parts: () => [
      { name: "chimney", pts: poly([68, 32], [68, 12], [80, 12], [80, 40]) },
      { name: "roof", pts: closed([4, 50], [50, 8], [96, 50]), occlude: true, fill: "purple" },
      { name: "body", pts: closed([12, 48], [88, 48], [88, 100], [12, 100]), occlude: true },
      { name: "door", pts: poly([42, 100], [42, 72], [58, 72], [58, 100]) },
      { name: "winL", pts: closed([20, 58], [34, 58], [34, 72], [20, 72]), occlude: true, fill: "red" },
      { name: "winR", pts: closed([66, 58], [80, 58], [80, 72], [66, 72]) },
      { name: "winRx", pts: join(poly([73, 58], [73, 72]), poly([73, 72], [73, 65], [66, 65], [80, 65])), width: 0.6 },
    ],
  },
  lantern: {
    aspect: 0.6, grounded: true,
    parts: () => [
      { name: "handle", pts: curve([32, 20], [50, -8], [68, 20]) },
      { name: "cap", pts: closed([26, 20], [74, 20], [66, 30], [34, 30]), occlude: true },
      { name: "glass", pts: closed([34, 30], [66, 30], [66, 82], [34, 82]), occlude: true },
      { name: "flame", pts: join(curve([50, 40], [64, 58], [50, 72]), curve([50, 72], [36, 58], [50, 40])), occlude: true, fill: "red" },
      { name: "base", pts: closed([28, 82], [72, 82], [72, 94], [28, 94]), occlude: true },
    ],
  },
  rock: {
    aspect: 1.4, grounded: true,
    parts: () => [
      {
        name: "rock",
        pts: join(curve([4, 100], [2, 62], [26, 40]), curve([26, 40], [46, 22], [66, 32]), curve([66, 32], [96, 42], [97, 100]), poly([97, 100], [4, 100])),
        occlude: true, fill: "orange",
      },
      { name: "crack", pts: poly([44, 40], [50, 56], [45, 70]), width: 0.7 },
    ],
  },
  cloud: {
    aspect: 1.7, grounded: false,
    parts: () => [
      {
        name: "cloud",
        pts: join(
          curve([12, 82], [0, 58], [24, 52]), curve([24, 52], [26, 22], [50, 30]), curve([50, 30], [64, 6], [78, 32]),
          curve([78, 32], [100, 36], [92, 62]), curve([92, 62], [100, 84], [84, 82]), poly([84, 82], [12, 82]),
        ),
        occlude: true,
      },
    ],
  },
  flower: {
    aspect: 0.6, grounded: true,
    parts: (a) => {
      const petals: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        petals.push({ name: `petal${i}`, pts: circ(50 + (Math.cos(ang) * 15) / a, 28 + Math.sin(ang) * 15, 10, a, 24), occlude: true });
      }
      return [
        { name: "stem", pts: curve([50, 100], [40, 72], [50, 42]) },
        { name: "leaf", pts: join(curve([47, 80], [64, 60], [80, 64]), curve([80, 64], [66, 82], [47, 80])), occlude: true, fill: "green" },
        ...petals,
        { name: "centre", pts: circ(50, 28, 8, a, 24), occlude: true, fill: "red" },
      ];
    },
  },
  door: {
    aspect: 0.55, grounded: true,
    parts: (a) => [
      { name: "frame", pts: join(poly([10, 100], [10, 24]), curve([10, 24], [50, -10], [90, 24]), poly([90, 24], [90, 100])), occlude: true },
      { name: "panelTop", pts: closed([24, 32], [76, 32], [76, 56], [24, 56]), width: 0.7 },
      { name: "panelLow", pts: closed([24, 66], [76, 66], [76, 92], [24, 92]), width: 0.7 },
      { name: "knob", pts: circ(80, 62, 3.5, a, 16), occlude: true, fill: "red" },
    ],
  },
  window: {
    aspect: 1, grounded: false,
    parts: () => [
      { name: "frame", pts: closed([8, 6], [92, 6], [92, 90], [8, 90]), occlude: true },
      { name: "crossV", pts: poly([50, 6], [50, 90]) },
      { name: "crossH", pts: poly([8, 48], [92, 48]) },
      { name: "sill", pts: poly([0, 96], [100, 96]) },
      { name: "shine1", pts: poly([16, 22], [28, 14]), width: 0.6 },
      { name: "shine2", pts: poly([16, 32], [38, 16]), width: 0.6 },
    ],
  },
  hill: {
    aspect: 2.2, grounded: true,
    parts: () => [
      { name: "hump", pts: join(curve([0, 100], [50, -30], [100, 100]), poly([100, 100], [0, 100])), occlude: true, fill: "green" },
      { name: "tuft1", pts: poly([34, 46], [36, 38], [38, 45], [40, 37], [42, 46]), width: 0.7 },
      { name: "tuft2", pts: poly([60, 44], [62, 36], [64, 43], [66, 35], [68, 45]), width: 0.7 },
    ],
  },
  box: {
    aspect: 1.1, grounded: true,
    parts: () => [
      { name: "front", pts: closed([6, 34], [72, 34], [72, 100], [6, 100]), occlude: true },
      { name: "top", pts: closed([6, 34], [26, 14], [94, 14], [72, 34]), occlude: true },
      { name: "side", pts: closed([72, 34], [94, 14], [94, 80], [72, 100]), occlude: true, fill: "blue" },
      { name: "ribbonV", pts: poly([39, 34], [39, 100]), width: 0.8 },
      { name: "ribbonT", pts: poly([16, 24], [84, 24]), width: 0.8 },
      { name: "bow", pts: join(curve([50, 22], [36, 0], [36, 14]), curve([36, 14], [40, 22], [50, 22]), curve([50, 22], [64, 0], [64, 14]), curve([64, 14], [60, 22], [50, 22])) },
    ],
  },
  bush: {
    aspect: 1.6, grounded: true,
    parts: () => [
      { name: "bush", pts: bumpy(50, 64, 42, 34, 9, 0.2).map(([x, y]) => [x, Math.min(100, y)] as Pt), occlude: true, fill: "blue" },
    ],
  },
  bed: {
    aspect: 1.8, grounded: true,
    parts: () => [
      { name: "head", pts: join(poly([3, 100], [3, 30]), curve([3, 30], [9, 12], [15, 30]), poly([15, 30], [15, 100])), occlude: true },
      { name: "foot", pts: closed([86, 100], [86, 52], [97, 52], [97, 100]), occlude: true },
      { name: "mattress", pts: closed([15, 60], [86, 60], [86, 84], [15, 84]), occlude: true },
      { name: "pillow", pts: bumpy(28, 54, 9, 7, 4, 0.06, 36), occlude: true },
      { name: "blanket", pts: join(poly([38, 58], [86, 58], [86, 84], [38, 84]), curve([38, 84], [32, 71], [38, 58])), occlude: true, fill: "green" },
    ],
  },
  cave: {
    aspect: 1.6, grounded: true,
    parts: () => [
      {
        name: "mound",
        pts: join(curve([0, 100], [4, 30], [35, 14]), curve([35, 14], [55, 4], [72, 18]), curve([72, 18], [100, 34], [100, 100]), poly([100, 100], [0, 100])),
        occlude: true, fill: "pink",
      },
      { name: "mouth", pts: join(curve([30, 100], [28, 50], [50, 46]), curve([50, 46], [72, 50], [70, 100]), poly([70, 100], [30, 100])), occlude: true },
    ],
  },
};

const GROUNDED_CUSTOM = false;
const localCache = new Map<string, Part[]>();

function presetParts(preset: PropPreset): Part[] {
  const key = `preset:${preset}`;
  let parts = localCache.get(key);
  if (!parts) {
    parts = PRESETS[preset].parts(PRESETS[preset].aspect);
    localCache.set(key, parts);
  }
  return parts;
}

function customParts(prop: Prop): Part[] {
  const parts: Part[] = [];
  (prop.custom ?? []).forEach((pp, i) => {
    const d = sanitizePath(pp.d);
    if (!d) return;
    flattenPath(d).forEach((sub, j) => parts.push({ name: `custom${i}_${j}`, pts: sub, color: pp.color, width: (pp.width ?? 3) / 3 }));
  });
  return parts;
}

function resolve(prop: Prop): { parts: Part[]; aspect: number; grounded: boolean } {
  if (prop.preset && PRESETS[prop.preset]) {
    const pr = PRESETS[prop.preset];
    return { parts: presetParts(prop.preset), aspect: pr.aspect, grounded: pr.grounded };
  }
  const custom = customParts(prop);
  if (custom.length) return { parts: custom, aspect: 1, grounded: GROUNDED_CUSTOM };
  return { parts: presetParts("rock"), aspect: PRESETS.rock.aspect, grounded: true };
}

/** Board-px rect of a prop: centred on `at` (or the prop's own position), height = size * board height. */
export function propRect(prop: Prop, board: Board, at?: Pt): Rect {
  const [cx, cy] = at ?? toBoard(board, prop.at);
  const { aspect } = resolve(prop);
  const h = prop.size * board.h;
  const w = h * aspect;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Draw a prop with pen progress p (0..1) and an optional tap effect. Returns its rect for hit-testing. */
export function drawProp(
  ctx: Ctx, prop: Prop, board: Board, p: number,
  o: { ink: InkCtx; seed: string; at?: Pt; alpha?: number; effect?: { kind: "wiggle" | "pop" | "glow"; k: number } },
): Rect {
  const rect = propRect(prop, board, o.at);
  if (p <= 0) return rect;
  const { parts, grounded } = resolve(prop);
  const mapped = parts.map((pt) => ({ ...pt, pts: mapBox(pt.pts, rect.x, rect.y, rect.w, rect.h) }));
  const ax = rect.x + rect.w / 2;
  const ay = grounded ? rect.y + rect.h : rect.y + rect.h / 2;
  const width = Math.min(3.2, Math.max(1.6, rect.h / 50));
  ctx.save();
  const fx = o.effect;
  const k = fx ? clamp01(fx.k) : 0;
  if (fx && fx.kind === "wiggle" && k < 1) {
    const ang = Math.sin(k * Math.PI * 6) * ((8 * Math.PI) / 180) * (1 - k);
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.translate(-ax, -ay);
  } else if (fx && fx.kind === "pop" && k < 1) {
    const s = 1 + 0.25 * Math.sin(k * Math.PI);
    ctx.translate(ax, ay);
    ctx.scale(s, s);
    ctx.translate(-ax, -ay);
  }
  drawParts(ctx, mapped, p, { ink: o.ink, seed: o.seed, width, alpha: o.alpha });
  if (fx && fx.kind === "glow" && k < 1 && p >= 1) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const r = Math.max(rect.w, rect.h) * 0.6;
    const fade = 1 - clamp01((k - 0.55) / 0.45);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      const q = clamp01(k * 3 - i * 0.04);
      const r0 = r * (0.95 + 0.1 * (i % 2));
      stroke(ctx, line([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r0 * 1.28, cy + Math.sin(a) * r0 * 1.28], 3), q, {
        ink: o.ink, width: width * 0.9, seed: `${o.seed}:glow${i}`, alpha: fade * (o.alpha ?? 1),
      });
    }
  }
  ctx.restore();
  return rect;
}

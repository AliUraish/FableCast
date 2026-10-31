// Hand-made backdrops (readme 6.6): a ground line, side silhouettes and sky elements.
// They draw on with p at the start of a page: ground first, then big shapes, then details.
// The stage zone (x 10%..90%, 45% height down to the ground) is kept mostly clear for characters.
import type { Backdrop } from "@/lib/schemas";
import { curve, line, oval } from "../primitives";
import type { Board, Ctx, InkCtx, Pt } from "../types";
import { bumpy, closed, drawParts, join, poly, type Part } from "./props";

interface Dims { W: number; H: number; G: number; s: number; portrait: boolean }

// ---------- px helpers ----------
function wavy(x0: number, x1: number, y: number, amp: number, period: number, phase = 0): Pt[] {
  const pts: Pt[] = [];
  const n = Math.max(2, Math.ceil((x1 - x0) / 24));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, y + amp * Math.sin(x / period + phase)]);
  }
  return pts;
}

const ground = (d: Dims, amp = 3, period = 140, phase = 0): Part => ({
  name: "ground", pts: wavy(-10, d.W + 10, d.G, amp * d.s, period * d.s, phase), width: 3,
});

function pine(name: string, cx: number, baseY: number, h: number, fill?: Part["fill"]): Part[] {
  const w = h * 0.42;
  const b = baseY - h * 0.14;
  const pts: Pt[] = [
    [cx - w / 2, b], [cx - w * 0.2, b - h * 0.28], [cx - w * 0.4, b - h * 0.28], [cx - w * 0.14, b - h * 0.56],
    [cx - w * 0.3, b - h * 0.56], [cx, b - h * 0.86], [cx + w * 0.3, b - h * 0.56], [cx + w * 0.14, b - h * 0.56],
    [cx + w * 0.4, b - h * 0.28], [cx + w * 0.2, b - h * 0.28], [cx + w / 2, b],
  ];
  return [
    { name: `${name}trunk`, pts: poly([cx - w * 0.06, baseY], [cx - w * 0.06, b], [cx + w * 0.06, b], [cx + w * 0.06, baseY]), width: 2.2 },
    { name: `${name}body`, pts: closed(...pts), width: 2.2, occlude: true, fill },
  ];
}

function twinkle(name: string, x: number, y: number, r: number): Part {
  // A four-point star: drawn as one stroke so it pops in quickly.
  return {
    name,
    pts: poly([x, y - r], [x + r * 0.22, y - r * 0.22], [x + r, y], [x + r * 0.22, y + r * 0.22], [x, y + r], [x - r * 0.22, y + r * 0.22], [x - r, y], [x - r * 0.22, y - r * 0.22], [x, y - r]),
    width: 1.6, color: "yellow",
  };
}

function tuft(name: string, x: number, y: number, s: number): Part {
  return {
    name,
    pts: poly([x - 9 * s, y - 10 * s], [x - 3 * s, y], [x, y - 15 * s], [x + 3 * s, y], [x + 9 * s, y - 11 * s]),
    width: 1.6, color: "yellow",
  };
}

function puff(name: string, cx: number, cy: number, w: number): Part {
  const h = w * 0.5;
  const X = (u: number) => cx - w / 2 + (u / 100) * w;
  const Y = (v: number) => cy - h / 2 + (v / 100) * h;
  const P = (u: number, v: number): Pt => [X(u), Y(v)];
  return {
    name,
    pts: join(
      curve(P(12, 84), P(0, 58), P(24, 52)), curve(P(24, 52), P(26, 18), P(50, 28)), curve(P(50, 28), P(66, 4), P(78, 32)),
      curve(P(78, 32), P(100, 36), P(90, 62)), curve(P(90, 62), P(100, 86), P(82, 84)), poly(P(82, 84), P(12, 84)),
    ),
    width: 2, color: "yellow", occlude: true,
  };
}

function gull(name: string, x: number, y: number, s: number): Part {
  return { name, pts: join(curve([x - 12 * s, y], [x - 6 * s, y - 8 * s], [x, y]), curve([x, y], [x + 6 * s, y - 8 * s], [x + 12 * s, y])), width: 1.6, color: "yellow" };
}

function house(name: string, x: number, baseY: number, w: number, lit: boolean): Part[] {
  const h = w * 1.3;
  const top = baseY - h * 0.62;
  const win = w * 0.24;
  return [
    { name: `${name}roof`, pts: closed([x - w * 0.08, top + 2], [x + w / 2, baseY - h], [x + w * 1.08, top + 2]), width: 2.2, occlude: true, fill: "purple" },
    { name: `${name}body`, pts: closed([x, top], [x + w, top], [x + w, baseY], [x, baseY]), width: 2.2, occlude: true },
    { name: `${name}win`, pts: closed([x + w * 0.16, top + w * 0.16], [x + w * 0.16 + win, top + w * 0.16], [x + w * 0.16 + win, top + w * 0.16 + win], [x + w * 0.16, top + w * 0.16 + win]), width: 1.8, occlude: true, fill: lit ? "red" : null },
    { name: `${name}door`, pts: poly([x + w * 0.58, baseY], [x + w * 0.58, baseY - h * 0.3], [x + w * 0.8, baseY - h * 0.3], [x + w * 0.8, baseY]), width: 1.8 },
  ];
}

function spiral(name: string, cx: number, cy: number, r: number, dir: 1 | -1): Part {
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = dir * t * Math.PI * 3;
    const rr = r * (1 - t * 0.85);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return { name, pts: join(line([cx - dir * r * 2.4, cy], [cx + r, cy], 6), pts), width: 1.6, color: "yellow" };
}

/** Deterministic scatter positions in [0,1) (golden-ratio sequence). */
const scatter = (i: number, k: number) => (i * k + 0.13) % 1;

// ---------- backdrops ----------
const BUILD: Record<Backdrop, (d: Dims) => Part[]> = {
  night_forest: (d) => {
    const { W, H, G, s } = d;
    const hs = d.portrait ? 0.62 : 1;
    const parts: Part[] = [ground(d)];
    parts.push(...pine("pL1", W * 0.035, G + 2, H * 0.7 * hs), ...pine("pR1", W * 0.965, G + 2, H * 0.74 * hs));
    parts.push(...pine("pL2", W * 0.12, G + 2, H * 0.42 * hs, "blue"), ...pine("pR2", W * 0.885, G + 2, H * 0.46 * hs, "blue"));
    [[0.22, 0.09], [0.36, 0.21], [0.5, 0.06], [0.64, 0.17], [0.77, 0.08], [0.44, 0.33]].forEach(([x, y], i) =>
      parts.push(twinkle(`star${i}`, W * x, H * y, (i % 2 ? 6 : 9) * s)));
    [0.08, 0.21, 0.34, 0.47, 0.6, 0.73, 0.86, 0.95].forEach((x, i) => parts.push(tuft(`tuft${i}`, W * x, G + (H - G) * 0.6, s)));
    return parts;
  },

  cave: (d) => {
    const { W, H, G, s } = d;
    const archY = (t: number) => (1 - t) ** 2 * 0.56 * H + 2 * t * (1 - t) * -0.42 * H + t * t * 0.56 * H;
    const parts: Part[] = [ground(d, 4, 90)];
    parts.push({ name: "arch", pts: curve([0, 0.56 * H], [0.5 * W, -0.42 * H], [W, 0.56 * H], 40), width: 2.6 });
    parts.push({ name: "wallL", pts: curve([0, 0.56 * H], [0.075 * W, 0.74 * H], [0.02 * W, G]), width: 2.4 });
    parts.push({ name: "wallR", pts: curve([W, 0.56 * H], [0.925 * W, 0.74 * H], [0.98 * W, G]), width: 2.4 });
    [0.2, 0.33, 0.47, 0.6, 0.74, 0.86].forEach((t, i) => {
      const x = W * t;
      const y = archY(t) - 2;
      const len = H * (i % 2 ? 0.06 : 0.1);
      const half = 11 * s;
      parts.push({ name: `drip${i}`, pts: poly([x - half, y], [x, y + len], [x + half, y]), width: 2, color: "yellow" });
    });
    const rock = (name: string, x0: number, x1: number, h: number): Part => ({
      name,
      pts: join(curve([x0, G], [x0, G - h], [(x0 + x1) / 2, G - h]), curve([(x0 + x1) / 2, G - h], [x1, G - h * 0.9], [x1, G]), poly([x1, G], [x0, G])),
      width: 2.2, occlude: true, fill: "pink",
    });
    parts.push(rock("rockL", W * 0.01, W * 0.11, H * 0.08), rock("rockR", W * 0.88, W * 0.98, H * 0.1));
    for (let i = 0; i < 7; i++) {
      parts.push({ name: `pebble${i}`, pts: oval(W * (0.08 + scatter(i, 0.618) * 0.84), G + (H - G) * (0.35 + scatter(i, 0.37) * 0.45), 7 * s, 4 * s, 16), width: 1.4, color: "yellow" });
    }
    return parts;
  },

  bedroom: (d) => {
    const { W, H, G, s } = d;
    const parts: Part[] = [{ name: "floor", pts: wavy(-10, W + 10, G, 1, 200), width: 3 }];
    parts.push({ name: "skirting", pts: line([0, G - 0.03 * H], [W, G - 0.03 * H], 20), width: 1.6, color: "yellow" });
    const ww = Math.min(0.18 * W, 0.3 * H);
    const wx = 0.07 * W, wy = 0.1 * H, wh = ww * 1.25;
    parts.push({ name: "window", pts: closed([wx, wy], [wx + ww, wy], [wx + ww, wy + wh], [wx, wy + wh]), width: 2.2, occlude: true });
    parts.push({ name: "winV", pts: line([wx + ww / 2, wy], [wx + ww / 2, wy + wh], 8), width: 1.8 });
    parts.push({ name: "winH", pts: line([wx, wy + wh / 2], [wx + ww, wy + wh / 2], 8), width: 1.8 });
    parts.push({ name: "curtainL", pts: join(curve([wx - 8 * s, wy - 6 * s], [wx + ww * 0.25, wy + wh * 0.5], [wx - 8 * s, wy + wh + 14 * s])), width: 1.8, color: "yellow" });
    parts.push({ name: "curtainR", pts: join(curve([wx + ww + 8 * s, wy - 6 * s], [wx + ww * 0.75, wy + wh * 0.5], [wx + ww + 8 * s, wy + wh + 14 * s])), width: 1.8, color: "yellow" });
    parts.push({ name: "rod", pts: line([wx - 16 * s, wy - 6 * s], [wx + ww + 16 * s, wy - 6 * s], 8), width: 2 });
    const fw = Math.min(0.11 * W, 0.18 * H), fh = fw * 0.8, fx = 0.82 * W, fy = 0.14 * H;
    parts.push({ name: "frame", pts: closed([fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh]), width: 2 });
    parts.push({ name: "frameArt", pts: poly([fx + fw * 0.1, fy + fh * 0.85], [fx + fw * 0.38, fy + fh * 0.4], [fx + fw * 0.55, fy + fh * 0.65], [fx + fw * 0.72, fy + fh * 0.45], [fx + fw * 0.9, fy + fh * 0.85]), width: 1.4, color: "yellow" });
    [0.2, 0.4, 0.6, 0.8].forEach((x, i) => {
      const x0 = W * x;
      parts.push({ name: `board${i}`, pts: line([x0, G], [x0 + (x0 - W / 2) * 0.35, H], 6), width: 1.2, color: "yellow" });
    });
    parts.push({ name: "rug", pts: oval(W / 2, G + (H - G) * 0.5, 0.22 * W, (H - G) * 0.3, 48), width: 1.8, color: "yellow" });
    return parts;
  },

  meadow: (d) => {
    const { W, H, G, s } = d;
    const cw = Math.min(0.15 * W, 0.24 * H);
    const parts: Part[] = [ground(d, 4, 200)];
    parts.push({ name: "hillA", pts: curve([-0.05 * W, 0.67 * H], [0.22 * W, 0.53 * H], [0.5 * W, 0.66 * H], 30), width: 1.6, color: "yellow" });
    parts.push({ name: "hillB", pts: curve([0.42 * W, 0.67 * H], [0.75 * W, 0.51 * H], [1.05 * W, 0.65 * H], 30), width: 1.6, color: "yellow" });
    parts.push(puff("cloudA", 0.2 * W, 0.14 * H, cw), puff("cloudB", 0.74 * W, 0.1 * H, cw * 0.8));
    const blades = (name: string, x0: number, dir: number) => {
      const out: Part[] = [];
      for (let i = 0; i < 5; i++) {
        const x = x0 + dir * i * 9 * s;
        out.push({ name: `${name}${i}`, pts: curve([x, G], [x + dir * 4 * s, G - (40 + (i % 3) * 14) * s * 0.6], [x + dir * 12 * s, G - (60 + (i % 3) * 18) * s]), width: 1.6 });
      }
      return out;
    };
    parts.push(...blades("grassL", 0.015 * W, 1), ...blades("grassR", 0.985 * W, -1));
    const flower = (name: string, x: number): Part[] => [
      { name: `${name}stem`, pts: line([x, G], [x, G - 34 * s], 6), width: 1.6 },
      { name: `${name}head`, pts: bumpy(x, G - 40 * s, 7 * s, 7 * s, 5, 0.35, 40), width: 1.6, occlude: true },
    ];
    parts.push(...flower("flowerL", 0.075 * W), ...flower("flowerR", 0.93 * W));
    [0.12, 0.27, 0.41, 0.56, 0.69, 0.83].forEach((x, i) => parts.push(tuft(`tuft${i}`, W * x, G + (H - G) * 0.6, s)));
    return parts;
  },

  seaside: (d) => {
    const { W, H, G, s } = d;
    const hy = 0.6 * H;
    const parts: Part[] = [ground(d, 5, 160)];
    parts.push({ name: "horizon", pts: line([0, hy], [W, hy], 24), width: 1.6, color: "yellow" });
    [[0.05, 0.67], [0.15, 0.74], [0.3, 0.64], [0.68, 0.65], [0.86, 0.7], [0.95, 0.77]].forEach(([x, y], i) => {
      const cx = W * x, cy = H * y, w = 16 * s;
      parts.push({ name: `wave${i}`, pts: join(curve([cx - w, cy], [cx - w / 2, cy - 9 * s], [cx, cy]), curve([cx, cy], [cx + w / 2, cy - 9 * s], [cx + w, cy])), width: 1.6, color: "yellow" });
    });
    const bx = 0.8 * W;
    parts.push({ name: "hull", pts: closed([bx - 28 * s, hy - 9 * s], [bx + 28 * s, hy - 9 * s], [bx + 18 * s, hy], [bx - 18 * s, hy]), width: 1.8, occlude: true });
    parts.push({ name: "mast", pts: line([bx, hy - 9 * s], [bx, hy - 64 * s], 6), width: 1.6 });
    parts.push({ name: "sail", pts: closed([bx + 3 * s, hy - 62 * s], [bx + 3 * s, hy - 14 * s], [bx + 32 * s, hy - 14 * s]), width: 1.6, occlude: true });
    parts.push(gull("gullA", 0.3 * W, 0.15 * H, s), gull("gullB", 0.37 * W, 0.21 * H, s * 0.8), gull("gullC", 0.6 * W, 0.1 * H, s));
    for (let i = 0; i < 14; i++) {
      const x = W * (0.03 + scatter(i, 0.618) * 0.94);
      const y = G + (H - G) * (0.3 + scatter(i, 0.371) * 0.55);
      parts.push({ name: `sand${i}`, pts: line([x, y], [x + 3 * s, y + 1], 2), width: 1.6, color: "yellow" });
    }
    return parts;
  },

  village: (d) => {
    const { W, H, G, s } = d;
    const hw = Math.min(0.14 * W, 0.26 * H);
    const parts: Part[] = [{ name: "ground", pts: wavy(-10, W + 10, G, 1.5, 180), width: 3 }];
    parts.push({ name: "roadL", pts: line([0.42 * W, G], [0.3 * W, H], 8), width: 1.6, color: "yellow" });
    parts.push({ name: "roadR", pts: line([0.58 * W, G], [0.7 * W, H], 8), width: 1.6, color: "yellow" });
    parts.push(...house("hL2", 0.06 * W, G, hw * 0.75, false), ...house("hL1", -0.03 * W, G, hw, true));
    parts.push(...house("hR2", W - 0.06 * W - hw * 0.75, G, hw * 0.75, true), ...house("hR1", W + 0.03 * W - hw, G, hw, false));
    const lx = d.portrait ? 0.2 * W : 0.16 * W;
    const top = G - 0.4 * H;
    parts.push({ name: "pole", pts: line([lx, G], [lx, top], 12), width: 2.2 });
    parts.push({ name: "lamp", pts: closed([lx - 10 * s, top], [lx + 10 * s, top], [lx + 7 * s, top - 22 * s], [lx - 7 * s, top - 22 * s]), width: 1.8, occlude: true, fill: "red" });
    parts.push({ name: "lampCap", pts: poly([lx - 13 * s, top - 22 * s], [lx, top - 32 * s], [lx + 13 * s, top - 22 * s]), width: 1.8 });
    [[0.3, 0.1], [0.46, 0.2], [0.6, 0.07], [0.7, 0.24]].forEach(([x, y], i) => parts.push(twinkle(`star${i}`, W * x, H * y, (i % 2 ? 6 : 8) * s)));
    for (let i = 0; i < 9; i++) {
      const x = W * (0.32 + scatter(i, 0.618) * 0.36);
      const y = G + (H - G) * (0.25 + scatter(i, 0.41) * 0.6);
      parts.push({ name: `cobble${i}`, pts: oval(x, y, 9 * s, 4 * s, 16), width: 1.2, color: "yellow" });
    }
    return parts;
  },

  sky: (d) => {
    const { W, H, G, s } = d;
    const step = 0.1 * W;
    const scallops: Pt[][] = [];
    for (let x = -step / 2; x < W + step; x += step) scallops.push(curve([x, G + 0.02 * H], [x + step / 2, G + 0.1 * H], [x + step, G + 0.02 * H], 10));
    const cw = Math.min(0.16 * W, 0.26 * H);
    const parts: Part[] = [ground(d, 4, 120)];
    parts.push({ name: "bank", pts: join(...scallops), width: 2, color: "yellow" });
    parts.push(puff("cloudA", 0.15 * W, 0.2 * H, cw), puff("cloudB", 0.84 * W, 0.34 * H, cw * 0.8), puff("cloudC", 0.56 * W, 0.08 * H, cw * 0.6));
    parts.push(spiral("swirlL", 0.08 * W, 0.56 * H, 16 * s, 1), spiral("swirlR", 0.92 * W, 0.62 * H, 14 * s, -1));
    parts.push(gull("birdA", 0.36 * W, 0.25 * H, s), gull("birdB", 0.42 * W, 0.3 * H, s * 0.8));
    [[0.27, 0.06], [0.7, 0.16], [0.9, 0.08], [0.06, 0.4], [0.62, 0.3]].forEach(([x, y], i) => parts.push(twinkle(`star${i}`, W * x, H * y, (i % 2 ? 6 : 8) * s)));
    return parts;
  },

  hilltop: (d) => {
    const { W, H, G, s } = d;
    const parts: Part[] = [{
      name: "hill",
      pts: join(curve([-0.02 * W, G + 0.1 * H], [0.06 * W, G], [0.18 * W, G], 16), line([0.18 * W, G], [0.82 * W, G], 24), curve([0.82 * W, G], [0.94 * W, G], [1.02 * W, G + 0.1 * H], 16)),
      width: 3,
    }];
    parts.push({ name: "farL", pts: curve([-0.02 * W, 0.8 * H], [0.06 * W, 0.72 * H], [0.14 * W, 0.8 * H], 16), width: 1.4, color: "yellow" });
    parts.push({ name: "farR", pts: curve([0.86 * W, 0.8 * H], [0.95 * W, 0.71 * H], [1.02 * W, 0.78 * H], 16), width: 1.4, color: "yellow" });
    const tx = 0.91 * W, tb = G + 0.015 * H, th = 0.3 * H * (d.portrait ? 0.7 : 1);
    parts.push({ name: "trunk", pts: poly([tx - 5 * s, tb], [tx - 4 * s, tb - th * 0.45], [tx + 4 * s, tb - th * 0.45], [tx + 5 * s, tb]), width: 2.2 });
    parts.push({ name: "crown", pts: bumpy(tx, tb - th * 0.68, th * 0.28, th * 0.3, 7, 0.09), width: 2.2, occlude: true, fill: "blue" });
    [[0.18, 0.08], [0.3, 0.22], [0.47, 0.05], [0.58, 0.18], [0.7, 0.07], [0.82, 0.2], [0.4, 0.34], [0.08, 0.3]].forEach(([x, y], i) =>
      parts.push(twinkle(`star${i}`, W * x, H * y, (i % 3 ? 6 : 9) * s)));
    parts.push({ name: "shoot", pts: line([0.62 * W, 0.28 * H], [0.75 * W, 0.36 * H], 10), width: 1.4, color: "yellow" });
    [0.24, 0.38, 0.52, 0.66, 0.78].forEach((x, i) => parts.push(tuft(`tuft${i}`, W * x, G + (H - G) * 0.55, s)));
    return parts;
  },
};

const cache = new Map<string, Part[]>();

/** Draw a backdrop preset with pen progress p (0..1). */
export function drawBackdrop(ctx: Ctx, name: Backdrop, board: Board, p: number, o: { ink: InkCtx; seed: string }): void {
  if (p <= 0) return;
  const key = `${name}:${board.w}x${board.h}:${board.groundY}`;
  let parts = cache.get(key);
  if (!parts) {
    const build = BUILD[name] ?? BUILD.meadow;
    parts = build({ W: board.w, H: board.h, G: board.groundY, s: Math.min(board.w, board.h) / 720, portrait: board.orientation === "portrait" });
    cache.set(key, parts);
  }
  drawParts(ctx, parts, p, { ink: o.ink, seed: o.seed, width: 1 });
}

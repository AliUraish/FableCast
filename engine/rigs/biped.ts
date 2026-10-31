// Hand-made biped rig (readme 6.5). Geometry is fixed code; a CharacterSkin only picks ink tokens
// and feature variants. Everything is a pure function of the pose (no clocks, no randomness).
// Local frame: feet at (0,0), y grows down, the character is 100 units (u) tall, facing +x.
import type { CharacterSkin, ColorName, Expression } from "@/lib/schemas";
import { curve, ease, lerp, line, oval, seg, stroke, type StrokeOpts } from "../primitives";
import { xform } from "../flatten";
import type { CharDrawOpts, CharPose, Ctx, Pt } from "../types";

export const TAU = Math.PI * 2;

// ---------- face + motion state ----------
export type EyeShape = "dots" | "round" | "sleepy" | "closed" | "happy" | "wide";
export type BrowShape = "none" | "flat" | "raised" | "one" | "worried" | "scared";
export type MouthShape = "small" | "smile" | "big" | "flat" | "o" | "open" | "wavy";
export interface FaceState { eyes: EyeShape; brows: BrowShape; mouth: MouthShape; look: number }

export interface Motion {
  dx: number; dy: number; sx: number; sy: number; lean: number;
  armR: number; armL: number; legR: number; legL: number; // radians; 0 = hanging straight down
  shoulder: number; headTilt: number; headDy: number;
  breath: number; wingFlap: number; tailSway: number; zzz: number;
  face: FaceState;
}

/** 0 -> 1 -> 0 over a gesture: eases in over the first 20%, holds, eases back to rest by p = 1. */
export function envelope(p: number): number {
  return ease(Math.min(seg(p, 0, 0.2), 1 - seg(p, 0.8, 1)));
}

export function baseFace(skin: CharacterSkin, expr: Expression, look: number): FaceState {
  const eyes: EyeShape = skin.features.eyes === "round" ? "round" : skin.features.eyes === "sleepy" ? "sleepy" : "dots";
  switch (expr) {
    case "happy": return { eyes: "happy", brows: "none", mouth: "big", look };
    case "curious": return { eyes: eyes === "sleepy" ? "round" : eyes, brows: "one", mouth: "o", look };
    case "worried": return { eyes, brows: "worried", mouth: "wavy", look };
    case "scared": return { eyes: "wide", brows: "scared", mouth: "open", look };
    case "sleepy": return { eyes: "sleepy", brows: "none", mouth: "small", look };
    case "proud": return { eyes: "closed", brows: "flat", mouth: "big", look };
    default: return { eyes, brows: "none", mouth: "smile", look };
  }
}

function jump(m: Motion, p: number, u: number, k = 1) {
  const hop = Math.sin(Math.PI * seg(p, 0.15, 0.85));
  const crouch = p < 0.15 ? Math.sin(Math.PI * seg(p, 0, 0.15)) : p > 0.85 ? Math.sin(Math.PI * seg(p, 0.85, 1)) : 0;
  m.dy -= 24 * u * hop * k;
  m.sy *= 1 - 0.12 * crouch + 0.05 * hop;
  m.sx *= 1 + 0.08 * crouch;
  m.armR = lerp(m.armR, -2.5, hop * k);
  m.armL = lerp(m.armL, 2.5, hop * k);
  m.legR -= 0.25 * hop;
  m.legL += 0.25 * hop;
}

/** All posture for this pose: locomotion, expression posture, gesture, tap reaction. `hop` = blob locomotion. */
export function computeMotion(skin: CharacterSkin, pose: CharPose, o: CharDrawOpts, u: number, hop = false): Motion {
  const alive = pose.draw >= 1;
  const m: Motion = {
    dx: 0, dy: 0, sx: 1, sy: 1, lean: 0,
    armR: hop ? -0.6 : -0.15, armL: hop ? 0.6 : 0.15, legR: 0, legL: 0,
    shoulder: 0, headTilt: 0, headDy: 0, breath: 0, wingFlap: 0, tailSway: 0, zzz: 0,
    face: baseFace(skin, alive ? pose.expression : "neutral", pose.lookX ?? 0),
  };
  if (!alive) return m; // still being sketched: no motion yet
  const t = pose.t;
  const still = !!o.ink.reducedMotion;
  if (!still) {
    m.breath = 0.015 * Math.sin(TAU * 0.25 * t);
    m.wingFlap = 0.14 * Math.sin(t * 5);
    m.tailSway = 0.12 * Math.sin(t * 2.2);
  }

  // locomotion
  const mv = Math.max(0, Math.min(1, pose.moving));
  if (mv > 0) {
    const s = Math.sin(pose.walk);
    const h = Math.abs(s);
    if (hop) {
      m.dy -= 14 * u * h * mv;
      const squash = (1 - h) * mv;
      m.sy *= 1 - 0.12 * squash + 0.06 * h * mv;
      m.sx *= 1 + 0.1 * squash - 0.04 * h * mv;
      m.armR = lerp(m.armR, -1.3, h * mv * 0.7);
      m.armL = lerp(m.armL, 1.3, h * mv * 0.7);
    } else {
      m.legR = -0.44 * s * mv; // about +/-25 degrees
      m.legL = 0.44 * s * mv;
      m.armR += 0.35 * s * mv; // about +/-20 degrees, counter-swing
      m.armL -= 0.35 * s * mv;
      m.dy += (2.4 * h - 1.6 * (1 - h)) * u * mv; // ~4% bob, feet stay on the ground
    }
  }

  // expression posture
  switch (pose.expression) {
    case "happy": if (!still) m.dy -= 1.6 * u * Math.abs(Math.sin(t * 5)); break;
    case "curious": m.headTilt += 0.13; break;
    case "worried": m.shoulder += 2.2 * u; m.headTilt -= 0.05; m.armR = lerp(m.armR, hop ? -0.3 : 0, 0.5); break;
    case "scared": if (!still) m.dx += 0.8 * u * Math.sin(t * 41); break;
    case "sleepy": m.headTilt += 0.16; m.headDy += 2 * u; break;
    case "proud": m.headTilt -= 0.13; m.sx *= 1.03; break;
  }

  // gesture
  const g = pose.gesture;
  if (g) {
    const p = Math.max(0, Math.min(1, g.p));
    const e = envelope(p);
    switch (g.kind) {
      case "wave": m.armR = lerp(m.armR, -2.0 + 0.35 * Math.sin(p * TAU * 4), e); break;
      case "point": m.armR = lerp(m.armR, -1.5, e); m.face.look = lerp(m.face.look, 1, e); break;
      case "jump": jump(m, p, u); break;
      case "shrug":
        m.armR = lerp(m.armR, -1.25, e); m.armL = lerp(m.armL, 1.25, e);
        m.shoulder -= 3 * u * e; m.headTilt += 0.12 * e;
        if (e > 0.3) { m.face.mouth = "flat"; m.face.brows = "raised"; }
        break;
      case "hug":
        m.armR = lerp(m.armR, -1.35, e); m.armL = lerp(m.armL, -1.25, e);
        if (e > 0.3) { m.face.eyes = "happy"; m.face.mouth = "smile"; }
        break;
      case "hide":
        m.sy *= 1 - 0.28 * e;
        m.armR = lerp(m.armR, -2.8, e); m.armL = lerp(m.armL, -2.7, e);
        if (e > 0.4) m.face.eyes = "closed";
        break;
      case "peek":
        m.lean += 0.22 * e;
        if (e > 0.3) { m.face.eyes = "wide"; m.face.brows = "raised"; }
        break;
      case "spin": m.sx *= Math.cos(TAU * p); break;
      case "sleep":
        if (e > 0.15) { m.face.eyes = "closed"; m.face.mouth = "small"; m.face.brows = "none"; }
        m.headTilt += 0.25 * e; m.zzz = p;
        break;
      case "shiver":
        if (!still) m.dx += 1.4 * u * Math.sin(t * 63) * e;
        m.armR = lerp(m.armR, -0.7, e); m.armL = lerp(m.armL, -0.6, e);
        if (e > 0.2) { m.face.brows = "worried"; m.face.mouth = "wavy"; }
        break;
    }
  }

  // tap reaction: jump + happy face
  if (pose.react > 0 && pose.react < 1) {
    jump(m, pose.react, u, 0.7);
    m.face = { ...m.face, eyes: "happy", mouth: "big", brows: "raised" };
  }
  return m;
}

// ---------- geometry helpers ----------
/** Closed polygon with densified edges (so the jitter has points to bend). */
export function poly(pts: Pt[], closed = true): Pt[] {
  const out: Pt[] = [pts[0]];
  const all = closed ? [...pts, pts[0]] : pts;
  for (let i = 1; i < all.length; i++) out.push(...line(all[i - 1], all[i], 5).slice(1));
  return out;
}

/** Stadium: top cap centre (0,0), bottom cap centre (0,L), radius r. Closed loop. */
export function capsule(L: number, r: number, n = 10): Pt[] {
  const pts: Pt[] = [...line([-r, 0], [-r, L], 4)];
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push([Math.cos(a) * r, L + Math.sin(a) * r]);
  }
  pts.push(...line([r, L], [r, 0], 4).slice(1));
  for (let i = 1; i <= n; i++) {
    const a = -(i / n) * Math.PI;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Egg: an oval a little wider below its middle. */
export function egg(cx: number, cy: number, rx: number, ry: number, n = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const s = Math.sin(a);
    pts.push([cx + Math.cos(a) * rx * (1 + 0.12 * Math.max(0, s)), cy + s * ry]);
  }
  return pts;
}

/** Bumpy closed outline (fluffy tail). */
export function cloud(cx: number, cy: number, r: number, bumps = 7, n = 56): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const rr = r * (1 + 0.14 * Math.abs(Math.sin((bumps / 2) * a)));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

export function limb(ctx: Ctx, at: Pt, angle: number, L: number, r: number, p: number, so: StrokeOpts): void {
  if (p <= 0) return;
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(angle);
  stroke(ctx, capsule(L, r), p, so);
  ctx.restore();
}

/** Optional parts in sketch order; each gets an equal slice of the "extras" window. */
export function extraNames(skin: CharacterSkin): string[] {
  const f = skin.features;
  const out: string[] = [];
  if (f.accessory === "cape") out.push("cape");
  if (f.wings) out.push("wings");
  if (f.tail !== "none") out.push("tail");
  if (f.spikes) out.push("spikes");
  if (f.ears !== "none") out.push("ears");
  if (f.horns) out.push("horns");
  if (f.accessory === "scarf") out.push("scarf");
  if (f.accessory === "hat") out.push("hat");
  return out;
}

export function extraProgress(draw: number, names: string[], name: string, from: number, to: number): number {
  const i = names.indexOf(name);
  if (i < 0) return 0;
  const w = (to - from) / names.length;
  return seg(draw, from + i * w, from + (i + 1) * w);
}

// ---------- features (shared with the blob rig) ----------
export interface HeadBox { cx: number; cy: number; rx: number; ry: number }

export function drawEars(ctx: Ctx, kind: CharacterSkin["features"]["ears"], h: HeadBox, u: number, p: number, so: StrokeOpts): void {
  if (p <= 0 || kind === "none") return;
  ([-1, 1] as const).forEach((side, i) => {
    const q = seg(p, i * 0.5, i * 0.5 + 0.5);
    if (q <= 0) return;
    const bx = h.cx + side * h.rx * 0.55;
    const by = h.cy - h.ry * 0.72;
    let pts: Pt[];
    if (kind === "round") pts = oval(bx + side * 2 * u, by - 3 * u, 8 * u, 8 * u, 28);
    else if (kind === "pointy") pts = poly([[bx - 7.5 * u, by + 3 * u], [bx + side * 5 * u, by - 17 * u], [bx + 7.5 * u, by + 3 * u]]);
    else pts = xform(oval(0, 0, 5.5 * u, 17 * u, 32), bx + side * 3 * u, by - 13 * u, side * 0.16);
    stroke(ctx, pts, q, { ...so, seed: `${so.seed}:${i}` });
  });
}

export function drawHorns(ctx: Ctx, h: HeadBox, u: number, p: number, so: StrokeOpts): void {
  if (p <= 0) return;
  ([-1, 1] as const).forEach((side, i) => {
    const q = seg(p, i * 0.5, i * 0.5 + 0.5);
    if (q <= 0) return;
    const bx = h.cx + side * h.rx * 0.38;
    const by = h.cy - h.ry * 0.82;
    const tip: Pt = [bx + side * 5 * u, by - 15 * u];
    const outer = curve([bx + side * 3.8 * u, by + 2 * u], [bx + side * 8 * u, by - 6 * u], tip, 10);
    const inner = curve(tip, [bx + side * 1 * u, by - 6 * u], [bx - side * 3.8 * u, by + 2 * u], 10);
    stroke(ctx, [...outer, ...inner.slice(1), outer[0]], q, { ...so, seed: `${so.seed}:${i}` });
  });
}

export function drawHat(ctx: Ctx, h: HeadBox, u: number, p: number, so: StrokeOpts): void {
  if (p <= 0) return;
  const baseY = h.cy - h.ry * 0.62;
  const L: Pt = [h.cx - h.rx * 0.78, baseY];
  const R: Pt = [h.cx + h.rx * 0.72, baseY];
  const tip: Pt = [h.cx + 6 * u, h.cy - h.ry - 28 * u];
  const left = curve(L, [L[0] + 9 * u, (L[1] + tip[1]) / 2], tip, 14);
  const right = curve(tip, [R[0] - 2 * u, (R[1] + tip[1]) / 2], R, 14);
  stroke(ctx, [...left, ...right.slice(1), ...line(R, L, 6).slice(1)], seg(p, 0, 0.75), so);
  stroke(ctx, line([L[0] - 6 * u, baseY + 1 * u], [R[0] + 6 * u, baseY + 1 * u], 8), seg(p, 0.75, 1), { ...so, fill: null, occlude: false, seed: `${so.seed}:brim` });
}

export function drawTail(ctx: Ctx, kind: CharacterSkin["features"]["tail"], at: Pt, u: number, p: number, so: StrokeOpts, sway: number, lw: number): void {
  if (p <= 0 || kind === "none") return;
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(-sway);
  if (kind === "short") stroke(ctx, oval(-4 * u, -2 * u, 6 * u, 5 * u, 24), p, { ...so, occlude: true });
  else if (kind === "fluffy") stroke(ctx, cloud(-8 * u, -5 * u, 8.5 * u), p, { ...so, occlude: true });
  else {
    const a = curve([0, 0], [-20 * u, 8 * u], [-25 * u, -12 * u], 20);
    const b = curve([-25 * u, -12 * u], [-28 * u, -24 * u], [-19 * u, -23 * u], 10);
    stroke(ctx, [...a, ...b.slice(1)], p, { ...so, width: lw * 1.7, fill: null, occlude: false });
  }
  ctx.restore();
}

export function drawWing(ctx: Ctx, at: Pt, u: number, p: number, so: StrokeOpts, flap: number): void {
  if (p <= 0) return;
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(-0.15 - flap);
  const top = curve([0, 0], [-6 * u, -20 * u], [-30 * u, -22 * u], 16);
  const s1 = curve([-30 * u, -22 * u], [-34 * u, -10 * u], [-24 * u, -8 * u], 8);
  const s2 = curve([-24 * u, -8 * u], [-24 * u, 2 * u], [-14 * u, -1 * u], 8);
  const s3 = curve([-14 * u, -1 * u], [-10 * u, 8 * u], [0, 4 * u], 8);
  stroke(ctx, [...top, ...s1.slice(1), ...s2.slice(1), ...s3.slice(1), [0, 0]], p, so);
  ctx.restore();
}

/** Triangular spikes along an ellipse arc (angles in canvas convention: PI = back, 1.5 PI = top). */
export function drawSpikes(ctx: Ctx, h: HeadBox, a0: number, a1: number, n: number, size: number, p: number, so: StrokeOpts): void {
  for (let i = 0; i < n; i++) {
    const q = seg(p, i / n, (i + 1) / n);
    if (q <= 0) continue;
    const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const da = ((a1 - a0) / n) * 0.42;
    const b1: Pt = [h.cx + Math.cos(a - da) * h.rx * 0.92, h.cy + Math.sin(a - da) * h.ry * 0.92];
    const b2: Pt = [h.cx + Math.cos(a + da) * h.rx * 0.92, h.cy + Math.sin(a + da) * h.ry * 0.92];
    const tip: Pt = [h.cx + Math.cos(a) * (h.rx + size), h.cy + Math.sin(a) * (h.ry + size)];
    stroke(ctx, poly([b1, tip, b2]), q, { ...so, seed: `${so.seed}:${i}` });
  }
}

export function drawScarf(ctx: Ctx, cx: number, y: number, w: number, u: number, p: number, so: StrokeOpts): void {
  if (p <= 0) return;
  const band = poly([[cx - w / 2, y - 3.5 * u], [cx + w / 2, y - 3.5 * u], [cx + w / 2 + 1 * u, y + 3.5 * u], [cx - w / 2 - 1 * u, y + 3.5 * u]]);
  const tx = cx - w / 2 + 5 * u;
  const tail = poly([[tx, y + 2 * u], [tx - 6 * u, y + 16 * u], [tx + 1 * u, y + 17 * u], [tx + 6 * u, y + 2 * u]]);
  stroke(ctx, tail, seg(p, 0, 0.4), { ...so, seed: `${so.seed}:tail` });
  stroke(ctx, band, seg(p, 0.4, 1), so);
}

export function drawCape(ctx: Ctx, at: Pt, u: number, p: number, so: StrokeOpts, sway: number): void {
  if (p <= 0) return;
  const [x, y] = at;
  const s = sway * 12 * u;
  const pts = [
    ...line([x - 11 * u, y], [x + 11 * u, y], 4),
    ...curve([x + 11 * u, y], [x + 14 * u, y + 18 * u], [x + 12 * u + s, y + 36 * u], 10).slice(1),
    ...curve([x + 12 * u + s, y + 36 * u], [x - 6 * u, y + 40 * u], [x - 26 * u + s, y + 34 * u], 10).slice(1),
    ...curve([x - 26 * u + s, y + 34 * u], [x - 16 * u, y + 16 * u], [x - 11 * u, y], 10).slice(1),
  ];
  stroke(ctx, pts, p, so);
}

export function drawZzz(ctx: Ctx, x: number, y: number, u: number, p: number, o: CharDrawOpts, lw: number): void {
  for (let i = 0; i < 3; i++) {
    const q = seg(p, i * 0.22, i * 0.22 + 0.35);
    if (q <= 0) continue;
    const s = (4 + i * 2) * u;
    const zx = x + i * 7 * u;
    const zy = y - i * 10 * u;
    stroke(ctx, [[zx, zy], [zx + s, zy], [zx, zy + s], [zx + s, zy + s]], q, { ink: o.ink, width: lw * 0.8 });
  }
}

// ---------- face ----------
function dot(ctx: Ctx, x: number, y: number, r: number, p: number, fo: StrokeOpts) {
  stroke(ctx, oval(x, y, r, r, 16), p, { ...fo, fill: "red", width: Math.max(1, (fo.width ?? 3) * 0.6) });
}

function drawEye(ctx: Ctx, kind: EyeShape, x: number, y: number, u: number, lk: number, p: number, fo: StrokeOpts) {
  if (p <= 0) return;
  switch (kind) {
    case "dots": dot(ctx, x + lk, y, 3 * u, p, fo); break;
    case "round":
      stroke(ctx, oval(x, y, 5.4 * u, 5.9 * u, 28), p, { ...fo, occlude: true });
      dot(ctx, x + lk + 0.8 * u, y + 0.6 * u, 2.5 * u, p, fo);
      break;
    case "wide":
      stroke(ctx, oval(x, y, 6.3 * u, 6.8 * u, 28), p, { ...fo, occlude: true });
      dot(ctx, x + lk, y, 1.7 * u, p, fo);
      break;
    case "sleepy": {
      const half = oval(x, y, 5.2 * u, 4.8 * u, 24, 0.5, 0);
      stroke(ctx, [...half, half[0]], p, { ...fo, occlude: true });
      stroke(ctx, line([x - 6.2 * u, y], [x + 6.2 * u, y], 4), p, fo);
      dot(ctx, x + lk, y + 2.2 * u, 1.7 * u, p, fo);
      break;
    }
    case "closed": stroke(ctx, curve([x - 4.5 * u, y - 1 * u], [x, y + 3.5 * u], [x + 4.5 * u, y - 1 * u], 10), p, fo); break;
    case "happy": stroke(ctx, curve([x - 4.5 * u, y + 1.5 * u], [x, y - 4.5 * u], [x + 4.5 * u, y + 1.5 * u], 10), p, fo); break;
  }
}

/** Face centred at (cx, cy); `u` is the face unit (blob faces pass a larger one). */
export function drawFace(
  ctx: Ctx, f: FaceState, cx: number, cy: number, u: number, p: number,
  o: CharDrawOpts, lw: number, glasses: boolean, accent: ColorName,
): void {
  if (p <= 0) return;
  const fo: StrokeOpts = { ink: o.ink, width: lw * 0.9 };
  const lk = f.look * 1.6 * u;
  const L: Pt = [cx - 7 * u, cy];
  const R: Pt = [cx + 9 * u, cy];
  const pe = seg(p, 0, 0.45), pb = seg(p, 0.4, 0.65), pm = seg(p, 0.6, glasses ? 0.85 : 1), pg = seg(p, 0.8, 1);
  drawEye(ctx, f.eyes, L[0], L[1], u, lk, pe, fo);
  drawEye(ctx, f.eyes, R[0], R[1], u, lk, pe, fo);

  const y0 = cy - 9 * u;
  const flat = (e: Pt, dy = 0) => line([e[0] - 4 * u, y0 + dy], [e[0] + 4 * u, y0 + dy], 4);
  const raised = (e: Pt, dy = 0) => curve([e[0] - 4 * u, y0 + dy], [e[0], y0 + dy - 3.5 * u], [e[0] + 4 * u, y0 + dy], 8);
  const worriedL = (dy: number) => line([L[0] - 4 * u, y0 + dy + 0.5 * u], [L[0] + 3.5 * u, y0 + dy - 2.5 * u], 4);
  const worriedR = (dy: number) => line([R[0] - 3.5 * u, y0 + dy - 2.5 * u], [R[0] + 4 * u, y0 + dy + 0.5 * u], 4);
  let brows: Pt[][] = [];
  switch (f.brows) {
    case "flat": brows = [flat(L), flat(R)]; break;
    case "raised": brows = [raised(L, -2 * u), raised(R, -2 * u)]; break;
    case "one": brows = [flat(L), raised(R, -3 * u)]; break;
    case "worried": brows = [worriedL(0), worriedR(0)]; break;
    case "scared": brows = [worriedL(-3 * u), worriedR(-3 * u)]; break;
  }
  brows.forEach((b) => stroke(ctx, b, pb, fo));

  const mx = cx + 2 * u, my = cy + 10 * u;
  let mouth: Pt[] = [];
  let fill = false;
  switch (f.mouth) {
    case "small": mouth = line([mx - 2.5 * u, my], [mx + 2.5 * u, my], 3); break;
    case "smile": mouth = curve([mx - 5 * u, my - 1 * u], [mx, my + 3.5 * u], [mx + 5 * u, my - 1 * u], 10); break;
    case "big": {
      const c = curve([mx - 7 * u, my - 1.5 * u], [mx, my + 9 * u], [mx + 7 * u, my - 1.5 * u], 14);
      mouth = [...c, ...line([mx + 7 * u, my - 1.5 * u], [mx - 7 * u, my - 1.5 * u], 4).slice(1)];
      fill = true;
      break;
    }
    case "flat": mouth = line([mx - 4 * u, my], [mx + 4 * u, my], 4); break;
    case "o": mouth = oval(mx, my, 2.6 * u, 2.8 * u, 16); fill = true; break;
    case "open": mouth = oval(mx, my + 1 * u, 3.6 * u, 5 * u, 22); fill = true; break;
    case "wavy": mouth = [[mx - 6 * u, my], [mx - 3 * u, my - 1.5 * u], [mx, my], [mx + 3 * u, my - 1.5 * u], [mx + 6 * u, my]]; break;
  }
  stroke(ctx, mouth, pm, { ...fo, occlude: fill });

  if (glasses && pg > 0) {
    const go: StrokeOpts = { ink: o.ink, color: accent, width: lw * 0.8 };
    stroke(ctx, oval(L[0], L[1], 7 * u, 6.5 * u, 28), seg(pg, 0, 0.4), go);
    stroke(ctx, oval(R[0], R[1], 7 * u, 6.5 * u, 28), seg(pg, 0.3, 0.7), go);
    stroke(ctx, curve([L[0] + 7 * u, cy - 1 * u], [cx + 1 * u, cy - 3 * u], [R[0] - 7 * u, cy - 1 * u], 6), seg(pg, 0.65, 0.85), go);
    stroke(ctx, line([L[0] - 7 * u, cy - 1 * u], [L[0] - 13 * u, cy - 3 * u], 3), seg(pg, 0.85, 1), go);
  }
}

// ---------- the biped ----------
// Sketch order windows (pose.draw): head, body, legs, arms, extras, face last.
const W = { head: [0, 0.18], torso: [0.18, 0.36], legL: [0.36, 0.44], legR: [0.42, 0.5], armL: [0.5, 0.57], armR: [0.55, 0.62], extras: [0.62, 0.82], face: [0.82, 1] } as const;

export function drawBiped(ctx: Ctx, skin: CharacterSkin, pose: CharPose, o: CharDrawOpts): void {
  const H = pose.height, u = H / 100;
  const m = computeMotion(skin, pose, o, u);
  const lw = Math.max(1.5, (3 * H) / 220);
  const F = skin.features, pal = skin.palette, D = pose.draw;
  const so = (part: string, x: Partial<StrokeOpts> = {}): StrokeOpts => ({
    ink: o.ink, color: pal.outline, width: lw, seed: `${o.seed}:${part}`, wobble: o.wobble, ...x,
  });
  const w = (k: keyof typeof W) => seg(D, W[k][0], W[k][1]);
  const names = extraNames(skin);
  const xp = (n: string) => extraProgress(D, names, n, W.extras[0], W.extras[1]);

  ctx.save();
  ctx.translate(pose.x + m.dx, pose.y + m.dy);
  ctx.scale(pose.facing, 1);
  ctx.rotate(m.lean);
  ctx.scale(m.sx, m.sy);

  const sh = m.shoulder;
  const torso: HeadBox = { cx: 0, cy: -41 * u, rx: 18 * u, ry: 18.5 * u };

  // back layer
  if (F.accessory === "cape") drawCape(ctx, [0, -55 * u + sh], u, xp("cape"), so("cape", { occlude: true, fill: pal.accent }), m.tailSway);
  if (F.wings) drawWing(ctx, [-6 * u, -50 * u], u, xp("wings"), so("wings", { occlude: true, fill: pal.accent }), m.wingFlap);
  if (F.tail !== "none") drawTail(ctx, F.tail, [-15 * u, -30 * u], u, xp("tail"), so("tail", { fill: pal.accent }), m.tailSway, lw);
  limb(ctx, [-9 * u, -51 * u + sh], m.armL, 18 * u, 4.2 * u, w("armL"), so("armL", { occlude: true }));
  limb(ctx, [-7 * u, -27 * u], m.legL, 22 * u, 5 * u, w("legL"), so("legL", { occlude: true }));
  limb(ctx, [7 * u, -27 * u], m.legR, 22 * u, 5 * u, w("legR"), so("legR", { occlude: true }));
  if (F.spikes) drawSpikes(ctx, torso, Math.PI * 0.95, Math.PI * 1.38, 3, 7 * u, xp("spikes"), so("spikes", { occlude: true, fill: pal.accent }));

  // torso (breathes about its base)
  ctx.save();
  ctx.translate(0, -23 * u);
  ctx.scale(1, 1 + m.breath);
  ctx.translate(0, 23 * u);
  stroke(ctx, egg(torso.cx, torso.cy, torso.rx, torso.ry), w("torso"), so("torso", { occlude: true, fill: pal.body }));
  ctx.restore();
  if (F.accessory === "scarf") drawScarf(ctx, 0, -55 * u + sh, 32 * u, u, xp("scarf"), so("scarf", { occlude: true, fill: pal.accent }));

  // head group, pivoting at the neck
  ctx.save();
  ctx.translate(1 * u, -56 * u + sh * 0.5 + m.headDy - m.breath * 20 * u);
  ctx.rotate(m.headTilt);
  const head: HeadBox = { cx: 2 * u, cy: -21 * u, rx: 25 * u, ry: 22 * u };
  if (F.ears !== "none") drawEars(ctx, F.ears, head, u, xp("ears"), so("ears", { occlude: true, fill: pal.accent }));
  if (F.horns) drawHorns(ctx, head, u, xp("horns"), so("horns", { occlude: true, fill: pal.accent }));
  stroke(ctx, oval(head.cx, head.cy, head.rx, head.ry, 52), w("head"), so("head", { occlude: true }));
  drawFace(ctx, m.face, head.cx + 3 * u, head.cy + 1 * u, u, w("face"), o, lw, F.accessory === "glasses", pal.accent);
  if (F.accessory === "hat") drawHat(ctx, head, u, xp("hat"), so("hat", { occlude: true, fill: pal.accent }));
  if (m.zzz > 0) drawZzz(ctx, head.cx + 18 * u, head.cy - 22 * u, u, m.zzz, o, lw);
  ctx.restore();

  // front arm last so hide/hug read in front of the body
  limb(ctx, [9 * u, -51 * u + sh], m.armR, 18 * u, 4.2 * u, w("armR"), so("armR", { occlude: true }));
  ctx.restore();
}

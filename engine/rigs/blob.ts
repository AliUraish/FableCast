// Hand-made blob rig (readme 6.5): one gumdrop body, big face, stub arms. Locomotion is a hop
// with squash and stretch. Shares faces, features and gestures with the biped rig.
import type { CharacterSkin } from "@/lib/schemas";
import { oval, seg, stroke, type StrokeOpts } from "../primitives";
import type { CharDrawOpts, CharPose, Ctx, Pt } from "../types";
import {
  computeMotion, drawCape, drawEars, drawFace, drawHat, drawHorns, drawScarf, drawSpikes, drawTail, drawWing,
  drawZzz, extraNames, extraProgress, limb, type HeadBox,
} from "./biped";

/** Oval with a softly flattened bottom so it sits on the ground. */
function gumdrop(h: HeadBox, u: number): Pt[] {
  const lim = -6 * u;
  return oval(h.cx, h.cy, h.rx, h.ry, 60).map(([x, y]) => [x, y > lim ? lim + (y - lim) * 0.4 : y] as Pt);
}

// Sketch order windows: body, arms, extras, face last.
const W = { body: [0, 0.3], armL: [0.3, 0.4], armR: [0.38, 0.5], extras: [0.5, 0.8], face: [0.8, 1] } as const;

export function drawBlob(ctx: Ctx, skin: CharacterSkin, pose: CharPose, o: CharDrawOpts): void {
  const H = pose.height, u = H / 100;
  const m = computeMotion(skin, pose, o, u, true);
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
  ctx.scale(m.sx, m.sy * (1 + m.breath));

  const body: HeadBox = { cx: 0, cy: -42 * u, rx: 38 * u, ry: 46 * u };
  const sh = m.shoulder;

  // back layer
  if (F.accessory === "cape") drawCape(ctx, [0, -62 * u + sh], u * 1.3, xp("cape"), so("cape", { occlude: true, fill: pal.accent }), m.tailSway);
  if (F.wings) drawWing(ctx, [-24 * u, -56 * u], u * 1.1, xp("wings"), so("wings", { occlude: true, fill: pal.accent }), m.wingFlap);
  if (F.tail !== "none") drawTail(ctx, F.tail, [-33 * u, -16 * u], u, xp("tail"), so("tail", { fill: pal.accent }), m.tailSway, lw);
  limb(ctx, [-31 * u, -36 * u + sh], m.armL, 9 * u, 5 * u, w("armL"), so("armL", { occlude: true }));
  if (F.spikes) drawSpikes(ctx, body, Math.PI * 1.05, Math.PI * 1.55, 4, 8 * u, xp("spikes"), so("spikes", { occlude: true, fill: pal.accent }));
  if (F.ears !== "none") drawEars(ctx, F.ears, body, u, xp("ears"), so("ears", { occlude: true, fill: pal.accent }));
  if (F.horns) drawHorns(ctx, body, u, xp("horns"), so("horns", { occlude: true, fill: pal.accent }));

  // body + belly patch (pattern kept off the face so it stays readable)
  stroke(ctx, gumdrop(body, u), w("body"), so("body", { occlude: true }));
  stroke(ctx, oval(2 * u, -21 * u, 19 * u, 11 * u, 36), seg(D, 0.22, 0.3), so("belly", { fill: pal.body, color: "yellow" }));
  if (F.accessory === "scarf") drawScarf(ctx, 0, -33 * u + sh, 64 * u, u, xp("scarf"), so("scarf", { occlude: true, fill: pal.accent }));

  // face (tilts with the head motion)
  ctx.save();
  ctx.translate(4 * u, -54 * u + m.headDy);
  ctx.rotate(m.headTilt * 0.6);
  drawFace(ctx, m.face, 0, 0, u * 1.25, w("face"), o, lw, F.accessory === "glasses", pal.accent, { nose: F.nose, whiskers: F.whiskers });
  ctx.restore();
  if (F.accessory === "hat") drawHat(ctx, body, u, xp("hat"), so("hat", { occlude: true, fill: pal.accent }));
  if (m.zzz > 0) drawZzz(ctx, 26 * u, -86 * u, u, m.zzz, o, lw);

  limb(ctx, [31 * u, -36 * u + sh], m.armR, 9 * u, 5 * u, w("armR"), so("armR", { occlude: true }));
  ctx.restore();
}

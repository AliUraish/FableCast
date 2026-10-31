// renderAt(ctx, timeline, t): the whole board as a pure function of t (plus wall-clock tap reactions).
// The caller sets the device-pixel transform; we draw in board units (1280x720 or 720x960).
import type { CharacterSkin, Prop } from "@/lib/schemas";
import { REACTION_MS } from "./interact";
import { drawBackdrop } from "./presets/backdrops";
import { drawProp, propRect } from "./presets/props";
import { ease, ring, around, seg, sparkle, stroke, write, clamp01, curve } from "./primitives";
import { characterRect, drawCharacter } from "./rigs";
import { boardTheme } from "./state";
import { bg, fg } from "./themes";
import { TURN } from "./timeline";
import { cameraAt, characterAt, charHeight, expressionAt, propAt, sceneAt, type Camera } from "./tracks";
import type { Board, Ctx, HitRegion, InkCtx, Pt, Rect, RenderOptions, Timeline } from "./types";

const camRect = (r: Rect, cam: Camera, board: Board): Rect => ({
  x: (r.x - cam.cx) * cam.z + board.w / 2,
  y: (r.y - cam.cy) * cam.z + board.h / 2,
  w: r.w * cam.z,
  h: r.h * cam.z,
});

/** Draw the whole board at time t. Returns hit regions (board coords) for tap testing. */
export function renderAt(ctx: Ctx, tl: Timeline, t: number, opts: RenderOptions): HitRegion[] {
  const { board } = opts;
  const base = opts.themeOverride ?? tl.startLights;
  const theme = boardTheme(tl, t, base);
  const ink: InkCtx = { theme, inkMode: opts.inkMode, reducedMotion: opts.reducedMotion };
  const now = opts.now ?? 0;
  const reactions = opts.reactions ?? [];
  const family = opts.fonts?.pixel || "monospace";
  const regions: HitRegion[] = [];

  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = bg(theme);
  ctx.fillRect(0, 0, board.w, board.h);

  const scene = sceneAt(tl, t);
  const last = tl.scenes[tl.scenes.length - 1];
  if (!scene) {
    if (tl.complete && last && t >= last.end) {
      write(ctx, "THE END", board.w / 2, board.h / 2 + 22, seg(t, last.end, last.end + 1.2), {
        ink, size: board.orientation === "portrait" ? 56 : 72, center: true, family,
      });
    }
    ctx.restore();
    return regions;
  }

  const cam = cameraAt(tl, scene, t, board, opts.reducedMotion);
  ctx.save();
  ctx.translate(board.w / 2, board.h / 2);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.cx, -cam.cy);

  // 1. The page: backdrop sketched on as the page opens.
  drawBackdrop(ctx, scene.backdrop, board, seg(t, scene.start, scene.start + 1.5), { ink, seed: `bd:${scene.index}:${scene.backdrop}` });

  // Active line (for the speaker's wobble).
  let active = null as (typeof tl.lines)[number] | null;
  for (const l of tl.lines) if (l.scene === scene.index && l.start <= t && t <= l.end + 0.2) active = l;
  const activeAgent = active ? tl.agents.find((a) => a.id === active!.agentId) : undefined;

  // 2. Props.
  for (const prop of scene.props) {
    const tr = propAt(tl, scene, prop, t, board);
    if (!tr.visible || tr.draw <= 0) continue;
    const r = reactions.find((x) => x.target === prop.id);
    const k = r ? clamp01((now - r.startedAt) / REACTION_MS) : 0;
    const effect = r && k < 1 && r.kind !== "jump" ? { kind: r.kind, k } : undefined;
    const rect = drawProp(ctx, prop, board, tr.draw, { ink, seed: `pr:${scene.index}:${prop.id}`, at: tr.center, alpha: tr.alpha, effect });
    if (prop.tappable !== false) regions.push({ id: prop.id, kind: "prop", rect: camRect(rect, cam, board) });
  }

  // 3. Characters (back to front by x so overlaps are stable).
  const chars = tl.characters
    .map((skin) => ({ skin, tr: characterAt(tl, scene, skin, t, board) }))
    .filter((c) => c.tr)
    .sort((a, b) => a.tr!.x - b.tr!.x);
  const rects = new Map<string, Rect>();
  for (const { skin, tr } of chars) {
    const r = reactions.find((x) => x.target === skin.id);
    const react = r ? clamp01((now - r.startedAt) / REACTION_MS) : 0;
    const speaking = active && active.character === skin.id;
    const pose = {
      x: tr!.x, y: board.groundY, height: charHeight(board, skin), facing: tr!.facing, draw: tr!.draw,
      walk: tr!.walk, moving: tr!.moving, expression: react > 0 && react < 1 ? ("happy" as const) : expressionAt(tl, scene.index, skin.id, t),
      gesture: tr!.gesture, react: react >= 1 ? 0 : react, t, lookX: tr!.lookX,
    };
    ctx.save();
    ctx.globalAlpha *= tr!.opacity;
    const rect = drawCharacter(ctx, skin, pose, { ink, seed: `ch:${skin.id}`, wobble: speaking ? activeAgent?.wobble ?? 0.3 : 0.15 });
    ctx.restore();
    rects.set(skin.id, rect);
    regions.push({ id: skin.id, kind: "character", rect: camRect(rect, cam, board) });
  }

  // 4. Emphasis marks: a ring / frame / sparkle in the speaker's ink, landing on the keyword.
  for (const e of tl.emphasis) {
    if (e.scene !== scene.index || t < e.start || t > e.end + 0.4) continue;
    let rect = rects.get(e.target);
    if (!rect) {
      const prop = scene.props.find((p) => p.id === e.target);
      if (prop) {
        const tr = propAt(tl, scene, prop, t, board);
        if (tr.visible) rect = propRect(prop, board, tr.center);
      }
    }
    if (!rect) continue;
    const p = ease(seg(t, e.start, e.start + 0.7));
    const alpha = 1 - seg(t, e.end, e.end + 0.4);
    const o = { ink, color: e.ink, width: 3.5, seed: `em:${e.scene}:${e.line}`, wobble: 0.4, alpha };
    if (e.kind === "sparkle") {
      sparkle(ctx, rect.x + rect.w * 0.85, rect.y + rect.h * 0.1, Math.min(60, rect.w * 0.35), p, o);
      sparkle(ctx, rect.x + rect.w * 0.1, rect.y + rect.h * 0.25, Math.min(40, rect.w * 0.25), seg(p, 0.3, 1), o);
    } else if (e.kind === "around") {
      stroke(ctx, around(rect, 12), p, o);
    } else {
      stroke(ctx, ring(rect, 14), p, o);
    }
  }
  ctx.restore(); // camera

  // 5. Page title, written on as the page opens.
  const titleIn = seg(t, scene.start + 0.2, scene.start + 0.9);
  const titleOut = 1 - seg(t, scene.audioStart + 0.8, scene.audioStart + 1.3);
  if (titleIn > 0 && titleOut > 0) {
    write(ctx, `PAGE ${scene.index + 1}`, board.w / 2, board.margin + 30, titleIn, {
      ink, size: board.orientation === "portrait" ? 28 : 34, center: true, family, alpha: titleOut,
    });
  }

  // 6. Page turn: the paper sweeps right to left behind a pen line.
  const turn = seg(t, scene.end - TURN, scene.end);
  if (turn > 0) {
    const x = board.w * (1 - ease(turn));
    ctx.fillStyle = bg(theme);
    ctx.fillRect(x, 0, board.w - x + 1, board.h);
    ctx.strokeStyle = fg(theme);
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x - 30 * (1 - turn), board.h / 2, x, board.h);
    ctx.stroke();
  }
  ctx.restore();
  return regions;
}

/** A character's idle sketch for a cast card of size w x h. draw = 0..1 pen progress. */
export function drawPortrait(ctx: Ctx, skin: CharacterSkin, w: number, h: number, ink: InkCtx, draw: number, t: number): void {
  ctx.save();
  ctx.fillStyle = bg(ink.theme);
  ctx.fillRect(0, 0, w, h);
  const height = Math.min(h * 0.82, w * 0.95) / Math.max(0.8, skin.scale ?? 1);
  drawCharacter(ctx, { ...skin, scale: 1 }, {
    x: w / 2, y: h * 0.93, height, facing: 1, draw, walk: 0, moving: 0, expression: "neutral",
    gesture: null, react: 0, t,
  }, { ink, seed: `ch:${skin.id}`, wobble: 0.1 });
  ctx.restore();
}

/**
 * Loading scene while a story is written: the pen sketches a little Halloween night, one thing at a time
 * (ground, moon, jack-o'-lantern, a bobbing ghost, bats flying across, twinkling stars), holds, fades, repeats.
 * Draws in a 1280x720 board; `seconds` is wall time since loading began.
 */
export function drawDoodle(ctx: Ctx, w: number, h: number, ink: InkCtx, seconds: number): void {
  ctx.save();
  ctx.fillStyle = bg(ink.theme);
  ctx.fillRect(0, 0, w, h);
  const board: Board = { w, h, margin: 0, groundY: h * 0.84, orientation: "landscape" };
  const cycle = 10;
  const c = seconds % cycle;
  const fade = 1 - seg(c, cycle - 0.8, cycle);
  const still = !!ink.reducedMotion;
  const o = { ink, width: 3, seed: "wait", wobble: 0.25, alpha: fade };
  const at = (x: number, y: number): Pt => [x * w, y * h];
  const prop = (id: string, preset: Prop["preset"], x: number, y: number, size: number): Prop =>
    ({ id, preset, at: [x, y], size, tappable: false, reaction: "wiggle" });

  // Ground line with a gentle hill.
  stroke(ctx, curve([w * 0.04, h * 0.84], [w * 0.5, h * 0.76], [w * 0.96, h * 0.84], 40), seg(c, 0, 0.9), o);
  // Moon, top right.
  drawProp(ctx, prop("moon", "moon", 0.8, 0.22, 0.24), board, seg(c, 0.8, 2.0), { ink, seed: "wait:moon", alpha: fade, at: at(0.8, 0.22) });
  // Jack-o'-lantern on the hill.
  drawProp(ctx, prop("pumpkin", "pumpkin", 0.3, 0.71, 0.26), board, seg(c, 2.0, 3.6), { ink, seed: "wait:pumpkin", alpha: fade, at: at(0.3, 0.71) });
  // A friendly ghost floating and bobbing.
  const bob = still ? 0 : Math.sin(seconds * 2.2) * 0.02;
  drawProp(ctx, prop("ghost", "ghost", 0.56, 0.46, 0.3), board, seg(c, 3.6, 5.2), { ink, seed: "wait:ghost", alpha: fade, at: at(0.56, 0.46 + bob) });
  // Two bats flying across the sky.
  for (const [i, y] of [[0, 0.16], [1, 0.3]] as const) {
    const travel = still ? 0.35 + i * 0.2 : ((seconds * (0.07 + i * 0.03) + i * 0.4) % 1.2) - 0.1;
    drawProp(ctx, prop(`bat${i}`, "bat", travel, y, 0.08), board, seg(c, 5.2 + i * 0.4, 6.2 + i * 0.4), { ink, seed: `wait:bat${i}`, alpha: fade, at: at(travel, y + (still ? 0 : Math.sin(seconds * 6 + i) * 0.012)) });
  }
  // Stars twinkle in last.
  const stars: [number, number, number][] = [[0.14, 0.2, 18], [0.38, 0.12, 12], [0.66, 0.1, 14], [0.92, 0.42, 10], [0.08, 0.5, 10]];
  stars.forEach(([x, y, r], i) => {
    const tw = still ? 1 : 0.75 + 0.25 * Math.sin(seconds * 3 + i);
    sparkle(ctx, x * w, y * h, r * tw, seg(c, 6.4 + i * 0.25, 7.2 + i * 0.25), o);
  });
  ctx.restore();
}

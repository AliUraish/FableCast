// renderAt(ctx, timeline, t): the whole board as a pure function of t (plus wall-clock tap reactions).
// The caller sets the device-pixel transform; we draw in board units (1280x720 or 720x960).
import type { CharacterSkin } from "@/lib/schemas";
import { REACTION_MS } from "./interact";
import { drawBackdrop } from "./presets/backdrops";
import { drawProp, propRect } from "./presets/props";
import { ease, ring, around, seg, sparkle, stroke, write, clamp01, oval } from "./primitives";
import { characterRect, drawCharacter } from "./rigs";
import { boardTheme } from "./state";
import { bg, fg } from "./themes";
import { TURN } from "./timeline";
import { cameraAt, characterAt, charHeight, expressionAt, propAt, sceneAt, type Camera } from "./tracks";
import type { Board, Ctx, HitRegion, InkCtx, Rect, RenderOptions, Timeline } from "./types";

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

/** Loading doodle: a moon and two stars drawn stroke by stroke, looping. */
export function drawDoodle(ctx: Ctx, w: number, h: number, ink: InkCtx, seconds: number): void {
  ctx.save();
  ctx.fillStyle = bg(ink.theme);
  ctx.fillRect(0, 0, w, h);
  const cycle = 3.2;
  const k = (seconds % cycle) / cycle;
  const p = seg(k, 0, 0.7);
  const fade = 1 - seg(k, 0.88, 1);
  const r = Math.min(w, h) * 0.22;
  const o = { ink, width: 3, seed: "doodle", wobble: 0.3, alpha: fade };
  // Crescent: outer arc and inner arc.
  stroke(ctx, oval(w / 2, h / 2, r, r, 48, 0.62, -Math.PI * 0.62), seg(p, 0, 0.55), o);
  stroke(ctx, oval(w / 2 + r * 0.42, h / 2 - r * 0.12, r * 0.78, r * 0.78, 48, 0.5, Math.PI * 0.62), seg(p, 0.5, 0.8), o);
  sparkle(ctx, w / 2 + r * 1.6, h / 2 - r * 0.9, r * 0.28, seg(p, 0.75, 0.95), o);
  sparkle(ctx, w / 2 - r * 1.5, h / 2 + r * 0.5, r * 0.2, seg(p, 0.85, 1), o);
  ctx.restore();
}

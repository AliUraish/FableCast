// Where every character and prop is at time t. Pure functions of (timeline, t): no accumulated state,
// so scrubbing, replay and headless capture all land on the same frame.
import type { CharacterSkin, Expression, Prop } from "@/lib/schemas";
import { clamp01, ease, lerp, seg } from "./primitives";
import type { Board, Pt, TLScene, Timeline } from "./types";
import { toBoard } from "./types";

export interface CharTrack {
  x: number;
  facing: 1 | -1;
  draw: number;
  walk: number;
  moving: number;
  gesture: { kind: import("@/lib/schemas").GestureKind; p: number } | null;
  opacity: number;
  lookX?: number;
}

export function charHeight(board: Board, skin: CharacterSkin): number {
  return Math.min(board.h * 0.32, board.w * 0.3) * (skin.scale ?? 1);
}

/** Smooth 0..1 "is walking" envelope inside a motion of progress k. */
const walkEnv = (k: number) => (k <= 0 || k >= 1 ? 0 : Math.min(1, k * 8, (1 - k) * 8));

export function characterAt(tl: Timeline, scene: TLScene, skin: CharacterSkin, t: number, board: Board, depth = 0): CharTrack | null {
  const acts = tl.actions
    .filter((a) => a.scene === scene.index && "who" in a.action && a.action.who === skin.id)
    .sort((a, b) => a.start - b.start);
  const h = charHeight(board, skin);
  let alive = false;
  let x = board.w / 2;
  let facing: 1 | -1 = 1;
  let draw = 0;
  let dist = 0;
  let moving = 0;
  let opacity = 1;
  let gesture: CharTrack["gesture"] = null;
  let lookX: number | undefined;

  for (const a of acts) {
    if (a.start > t) break;
    const k = clamp01((t - a.start) / Math.max(1e-3, a.end - a.start));
    const act = a.action;
    switch (act.type) {
      case "enter": {
        const toX = toBoard(board, act.to)[0];
        const side = act.from === "left" || act.from === "right";
        const fromX = act.from === "left" ? board.margin + h * 0.3 : act.from === "right" ? board.w - board.margin - h * 0.3 : toX;
        const drawK = seg(k, 0, side ? 0.42 : 0.75);
        const walkK = side ? ease(seg(k, 0.42, 1)) : 1;
        x = lerp(fromX, toX, walkK);
        dist += Math.abs(toX - fromX) * walkK;
        facing = toX > fromX + 1 ? 1 : toX < fromX - 1 ? -1 : toX < board.w / 2 ? 1 : -1;
        moving = side ? walkEnv(seg(k, 0.42, 1)) : 0;
        draw = drawK;
        alive = true;
        opacity = 1;
        break;
      }
      case "walk_to": {
        if (!alive) break;
        const toX = toBoard(board, act.to)[0];
        const kk = ease(k);
        const fromX = x;
        x = lerp(fromX, toX, kk);
        dist += Math.abs(toX - fromX) * kk;
        if (Math.abs(toX - fromX) > 2) facing = toX > fromX ? 1 : -1;
        moving = walkEnv(k);
        lookX = undefined;
        break;
      }
      case "exit": {
        if (!alive) break;
        if (act.to === "left" || act.to === "right") {
          const toX = act.to === "left" ? -h * 0.8 : board.w + h * 0.8;
          const kk = ease(k);
          const fromX = x;
          x = lerp(fromX, toX, kk);
          dist += Math.abs(toX - fromX) * kk;
          facing = toX > fromX ? 1 : -1;
          moving = walkEnv(k);
        } else {
          opacity = 1 - k;
        }
        if (k >= 1) alive = false;
        break;
      }
      case "face":
        facing = act.dir === "right" ? 1 : -1;
        lookX = undefined;
        break;
      case "look_at": {
        let tx: number | null = null;
        const prop = scene.props.find((p) => p.id === act.target);
        if (prop) tx = propAt(tl, scene, prop, a.start, board).center[0];
        else if (depth < 1) {
          const other = tl.characters.find((c) => c.id === act.target);
          const tr = other ? characterAt(tl, scene, other, a.start, board, depth + 1) : null;
          if (tr) tx = tr.x;
        }
        if (tx !== null && Math.abs(tx - x) > 2) {
          facing = tx > x ? 1 : -1;
          lookX = 0.7;
        }
        break;
      }
      case "gesture":
        if (t <= a.end) gesture = { kind: act.kind, p: k };
        break;
    }
  }
  if (!alive || opacity <= 0) return null;
  return { x, facing, draw, walk: (dist / (h * 0.55)) * Math.PI, moving, gesture, opacity, lookX };
}

export interface PropTrack {
  visible: boolean;
  draw: number;
  center: Pt;
  alpha: number;
}

export function propAt(tl: Timeline, scene: TLScene, prop: Prop, t: number, board: Board): PropTrack {
  const acts = tl.actions
    .filter((a) => a.scene === scene.index && a.action.type === "prop" && a.action.id === prop.id)
    .sort((a, b) => a.start - b.start);
  const hasAppear = acts.some((a) => a.action.type === "prop" && a.action.do === "appear");
  const idx = Math.max(0, scene.props.indexOf(prop));
  let center = toBoard(board, prop.at);
  let visible = !hasAppear;
  let draw = hasAppear ? 0 : seg(t, scene.start + 0.5 + idx * 0.18, scene.start + 1.4 + idx * 0.18);
  let alpha = 1;
  for (const a of acts) {
    if (a.start > t || a.action.type !== "prop") break;
    const k = clamp01((t - a.start) / Math.max(1e-3, a.end - a.start));
    const act = a.action;
    if (act.do === "appear") {
      visible = true;
      draw = k;
      alpha = 1;
    } else if (act.do === "disappear") {
      alpha = 1 - k;
      if (k >= 1) visible = false;
    } else if (act.do === "move" && act.to) {
      const to = toBoard(board, act.to);
      const kk = ease(k);
      center = [lerp(center[0], to[0], kk), lerp(center[1], to[1], kk)];
    }
  }
  return { visible: visible && alpha > 0, draw, center, alpha };
}

/** The expression a character shows at t: from the latest line about it in this scene. */
export function expressionAt(tl: Timeline, sceneIndex: number, charId: string, t: number): Expression {
  let e: Expression = "neutral";
  for (const l of tl.lines) {
    if (l.scene !== sceneIndex) continue;
    if (l.start > t) break;
    if (l.character === charId || l.focus === charId) e = l.decision.expression;
  }
  return e;
}

export function sceneAt(tl: Timeline, t: number): TLScene | null {
  for (const s of tl.scenes) if (t >= s.start && t < s.end) return s;
  return null;
}

export interface Camera { cx: number; cy: number; z: number }

export function cameraAt(tl: Timeline, scene: TLScene, t: number, board: Board, reduced?: boolean): Camera {
  const neutral: Camera = { cx: board.w / 2, cy: board.h / 2, z: 1 };
  if (reduced) return neutral;
  let cur = neutral;
  for (const a of tl.actions) {
    if (a.scene !== scene.index || a.action.type !== "camera" || a.start > t) continue;
    const k = ease(clamp01((t - a.start) / Math.max(1e-3, a.end - a.start)));
    const [fx, fy] = toBoard(board, a.action.focus);
    const target: Camera = { cx: fx, cy: fy, z: a.action.zoom };
    cur = { cx: lerp(cur.cx, target.cx, k), cy: lerp(cur.cy, target.cy, k), z: lerp(cur.z, target.z, k) };
  }
  // Ease back to the full page before the turn.
  const back = ease(seg(t, scene.end - 2.0, scene.end - 0.8));
  cur = { cx: lerp(cur.cx, neutral.cx, back), cy: lerp(cur.cy, neutral.cy, back), z: lerp(cur.z, 1, back) };
  const hw = board.w / (2 * cur.z);
  const hh = board.h / (2 * cur.z);
  cur.cx = Math.min(board.w - hw, Math.max(hw, cur.cx));
  cur.cy = Math.min(board.h - hh, Math.max(hh, cur.cy));
  return cur;
}

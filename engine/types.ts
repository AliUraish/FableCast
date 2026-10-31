// Shared engine types. The engine is a pure function of time: renderAt(ctx, timeline, t).
import type { WordTime } from "@/lib/api-types";
import type {
  Action, Backdrop, CharacterSkin, ColorName, Expression, GestureKind, LineDecision, MoodAgent, Prop,
} from "@/lib/schemas";

export type { WordTime };
export type ThemeMode = "night" | "day";
export type InkMode = "mono" | "chalk";
export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];
export interface Rect { x: number; y: number; w: number; h: number }

/** Everything a draw call needs to resolve ink. Never cache resolved colours across a theme flip. */
export interface InkCtx {
  theme: ThemeMode;
  inkMode: InkMode;
  reducedMotion?: boolean;
}

export interface Board {
  w: number;
  h: number;
  margin: number;
  groundY: number; // feet line in px (12% ground band at the bottom)
  orientation: "landscape" | "portrait";
}
export const LANDSCAPE: Board = { w: 1280, h: 720, margin: 60, groundY: Math.round(720 * 0.88), orientation: "landscape" };
export const PORTRAIT: Board = { w: 720, h: 960, margin: 40, groundY: Math.round(960 * 0.88), orientation: "portrait" };

/** Normalised stage position -> board px, inside safe margins. */
export function toBoard(board: Board, pos: [number, number]): Pt {
  return [board.margin + pos[0] * (board.w - 2 * board.margin), board.margin + pos[1] * (board.h - 2 * board.margin)];
}

// ---------- Characters ----------
export interface CharPose {
  x: number; // board px, centre of the feet
  y: number; // board px, the feet line
  height: number; // px, full standing height (already includes skin.scale)
  facing: 1 | -1; // 1 = facing right
  draw: number; // 0..1 pen sketch-on progress (parts in order head, body, limbs, face)
  walk: number; // walk-cycle phase in radians (advances with distance travelled)
  moving: number; // 0..1 blend between idle and walk cycle
  expression: Expression;
  gesture: { kind: GestureKind; p: number } | null; // p 0..1 through the gesture
  react: number; // 0..1 progress of a tap reaction (0 = none): jump + happy face
  t: number; // absolute seconds, for breathing / tremble (deterministic)
  lookX?: number; // -1..1 eye direction override (look_at)
}

export interface CharDrawOpts {
  ink: InkCtx;
  seed: string; // stable per character id: seeds the hand-drawn jitter
  wobble: number; // 0..1.5 extra shakiness (from the speaking agent)
}

// ---------- Timeline (compiled, absolute seconds) ----------
export interface TLLine {
  scene: number; // scene index
  index: number; // line index within scene
  global: number; // index across the story
  character: string; // character id or "narrator"
  speaker: string; // who SAYS the words: character id or "narrator" (captions show their name)
  text: string; // display text (tags stripped)
  performed: string;
  start: number;
  end: number;
  words: WordTime[]; // absolute
  decision: LineDecision;
  agentId: string;
  focus?: string;
  keyword?: string;
  keywordTime?: number; // absolute time the keyword is spoken
}

export interface TLScene {
  id: number;
  index: number;
  start: number; // page starts (backdrop begins to draw)
  end: number; // page ends (turn)
  audioStart: number; // absolute time scene audio begins
  audioSrc: string | null;
  audioDuration: number;
  backdrop: Backdrop;
  props: Prop[];
  summary: string;
  mood: string;
}

export interface TLAction {
  id: string;
  scene: number;
  line: number;
  start: number;
  end: number;
  action: Action;
}

export interface TLEmphasis {
  scene: number;
  line: number;
  start: number;
  end: number;
  target: string; // character or prop id
  kind: "ring" | "around" | "sparkle";
  ink: ColorName;
}

export interface Timeline {
  storyId: string;
  title: string;
  startLights: ThemeMode;
  duration: number; // end of the last compiled scene (+ THE END hold if complete)
  complete: boolean; // every scene compiled
  characters: CharacterSkin[];
  agents: MoodAgent[];
  scenes: TLScene[];
  lines: TLLine[];
  actions: TLAction[];
  emphasis: TLEmphasis[];
  lights: { t: number; mode: ThemeMode }[];
  warnings: string[];
}

// ---------- Interaction (wall-clock layer, never alters the timeline) ----------
export interface Reaction {
  target: string; // character id or prop id
  kind: "jump" | "wiggle" | "pop" | "glow";
  startedAt: number; // wall-clock ms (performance.now())
}

export interface Fonts {
  pixel: string; // resolved CSS font-family for Geist Pixel Square
}

export interface RenderOptions {
  board: Board;
  inkMode: InkMode;
  reducedMotion?: boolean;
  themeOverride?: ThemeMode; // user toggle: base theme (lights actions still flip relative to it)
  reactions?: Reaction[];
  now?: number; // wall-clock ms, for reactions
  fonts?: Fonts;
}

/** Hit regions produced by the last render, for tap testing. */
export interface HitRegion { id: string; kind: "character" | "prop"; rect: Rect }

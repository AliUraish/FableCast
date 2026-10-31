// Derived playback state for the UI at time t (cast strip, captions, Director's View).
import type { Expression } from "@/lib/schemas";
import { activeWordAt } from "./captions";
import { TURN } from "./timeline";
import { characterAt, expressionAt, sceneAt } from "./tracks";
import { LANDSCAPE, type ThemeMode, type TLLine, type Timeline } from "./types";
import { themeAt } from "./themes";

export interface PlaybackState {
  t: number;
  activeLine: TLLine | null; // the line being spoken (or the last one, during a pause)
  activeWordIndex: number; // index into activeLine.words, -1 before the first word
  previousLine: TLLine | null; // for the two-line caption fade
  onStage: string[]; // character ids currently on stage
  expressions: Record<string, Expression>;
  speakingCharacterId: string | null; // "narrator" for narrator lines, null in gaps
  speakingAgentId: string | null;
  page: number; // 0-based scene index
  theme: ThemeMode; // after lights actions
  ended: boolean;
}

export const invert = (m: ThemeMode): ThemeMode => (m === "night" ? "day" : "night");

/** Board theme at t: lights actions flip the user's base theme relative to the story's starting lights. */
export function boardTheme(tl: Timeline, t: number, base: ThemeMode): ThemeMode {
  return themeAt(tl.lights, tl.startLights, t) === tl.startLights ? base : invert(base);
}

export function stateAt(tl: Timeline, t: number, baseTheme: ThemeMode): PlaybackState {
  const scene = sceneAt(tl, t);
  const last = tl.scenes[tl.scenes.length - 1];
  const page = scene ? scene.index : last && t >= last.end ? last.index : 0;
  const ended = !!(tl.complete && last && t >= last.end);
  let activeLine: TLLine | null = null;
  let previousLine: TLLine | null = null;
  if (scene && t < scene.end - TURN) {
    for (const l of tl.lines) {
      if (l.scene !== scene.index) continue;
      if (l.start <= t) {
        previousLine = activeLine;
        activeLine = l;
      } else break;
    }
  }
  const speaking = !!activeLine && t <= activeLine.end;
  const onStage: string[] = [];
  const expressions: Record<string, Expression> = {};
  if (scene) {
    for (const c of tl.characters) {
      if (characterAt(tl, scene, c, t, LANDSCAPE)) {
        onStage.push(c.id);
        expressions[c.id] = expressionAt(tl, scene.index, c.id, t);
      }
    }
  }
  return {
    t,
    activeLine,
    activeWordIndex: activeLine ? activeWordAt(activeLine, t) : -1,
    previousLine,
    onStage,
    expressions,
    speakingCharacterId: speaking && activeLine ? activeLine.character : null,
    speakingAgentId: speaking && activeLine ? activeLine.agentId : null,
    page,
    theme: boardTheme(tl, t, baseTheme),
    ended,
  };
}

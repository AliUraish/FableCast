// compile(story) -> Timeline: turns line-relative staging (at/span 0..1) into absolute seconds using
// the real (or estimated) line and word times. Compiles the contiguous ready prefix of scenes, so
// page 1 plays while later pages are still being prepared; earlier times never move.
import type { PreparedStory, WordTime } from "@/lib/api-types";
import { NARRATOR_AGENT, type Action, type LineDecision, type MoodAgent, type TimedAction } from "@/lib/schemas";
import { lint } from "./lint";
import type { TLAction, TLEmphasis, TLLine, TLScene, ThemeMode, Timeline } from "./types";

export const PAGE_LEAD = 1.6; // backdrop draws and "PAGE N" shows before the voice starts
export const SCENE_TAIL = 1.2; // breath after the last line
export const TURN = 0.6; // page-turn wipe at the end of each scene
export const END_HOLD = 3.4; // THE END

const MIN_DUR: Record<Action["type"], number> = {
  enter: 1.8, walk_to: 1.0, exit: 1.2, gesture: 1.0, camera: 1.2, prop: 0.8, face: 0.2, look_at: 0.2, lights: 0.3,
};

export const NARRATOR_AGENT_DEF: MoodAgent = {
  id: NARRATOR_AGENT,
  name: "Narrator",
  mood: "plain, warm storyteller",
  routingHints: ["Plain narration", "Fallback voice"],
  voiceTraits: { age: "adult", gender: "neutral", quality: "warm" },
  tagPalette: [[], [], []],
  voiceSettings: { stability: 0.5, style: 0.3 },
  ink: "white",
  wobble: 0.2,
};

export const DEFAULT_DECISION: LineDecision = {
  agentId: NARRATOR_AGENT, intensity: 1, pause: "short", expression: "neutral", emphasis: false,
  latencyMs: 0, cacheHit: false, source: "default",
};

export const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
const WPS = 2.5;

function estimateWords(text: string, start: number): { end: number; words: WordTime[] } {
  const ws = text.split(/\s+/).filter(Boolean);
  const dur = Math.max(0.8, ws.length / WPS);
  const total = ws.reduce((s, w) => s + w.length + 1, 0);
  let acc = start;
  const words = ws.map((w) => {
    const d = ((w.length + 1) / total) * dur;
    const wt = { text: w, start: acc, end: acc + d * 0.92 };
    acc += d;
    return wt;
  });
  return { end: start + dur, words };
}

export function compile(story: PreparedStory): Timeline {
  const { bible } = story;
  const warnings: string[] = [];
  const agents = bible.agents.some((a) => a.id === NARRATOR_AGENT) ? bible.agents : [...bible.agents, NARRATOR_AGENT_DEF];
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const charIds = new Set(bible.characters.map((c) => c.id));
  const scenes: TLScene[] = [];
  const lines: TLLine[] = [];
  const actions: TLAction[] = [];
  const emphasis: TLEmphasis[] = [];
  const lights: { t: number; mode: ThemeMode }[] = [];
  let cursor = 0;
  let global = 0;
  let ready = 0;

  for (let i = 0; i < bible.scenes.length; i++) {
    const res = story.scenes[i];
    if (!res) break;
    ready++;
    const sc = bible.scenes[i];
    const W = (msg: string) => warnings.push(`WARN page ${i + 1}: ${msg}`);
    const start = cursor;
    const audioStart = start + PAGE_LEAD;

    // ---- lines (absolute times) ----
    const sceneLines: TLLine[] = [];
    let prevEnd = 0;
    sc.lines.forEach((ln, li) => {
      const al = res.audio.lines[li];
      let s: number, e: number, words: WordTime[];
      if (al && al.end > al.start) {
        s = al.start; e = al.end; words = al.words.length ? al.words : estimateWords(ln.text, s).words;
      } else {
        W(`line ${li + 1} has no audio timing; estimated`);
        s = prevEnd + 0.3;
        const est = estimateWords(ln.text, s);
        e = est.end; words = est.words;
      }
      prevEnd = e;
      let decision = res.decisions[li] ?? DEFAULT_DECISION;
      if (!agentById.has(decision.agentId)) {
        W(`line ${li + 1} names unknown performer "${decision.agentId}"; using the narrator`);
        decision = { ...decision, agentId: NARRATOR_AGENT };
      }
      const abs = words.map((w) => ({ text: w.text, start: audioStart + w.start, end: audioStart + w.end }));
      let keywordTime: number | undefined;
      if (ln.keyword) {
        const k = normWord(ln.keyword);
        const hit = abs.find((w) => normWord(w.text) === k) ?? abs.find((w) => k && normWord(w.text).startsWith(k));
        keywordTime = hit?.start;
      }
      const tl: TLLine = {
        scene: i, index: li, global: global++, character: ln.character, text: ln.text,
        performed: res.performed[li] ?? ln.text, start: audioStart + s, end: audioStart + e, words: abs,
        decision, agentId: decision.agentId, focus: ln.focus, keyword: ln.keyword, keywordTime,
      };
      sceneLines.push(tl);
      lines.push(tl);
    });

    const audioDuration = Math.max(res.audio.duration || 0, prevEnd);
    const end = audioStart + audioDuration + SCENE_TAIL;
    cursor = end;
    const propIds = new Set(res.staging.props.map((p) => p.id));
    scenes.push({
      id: sc.id, index: i, start, end, audioStart, audioSrc: res.audio.src, audioDuration,
      backdrop: res.staging.backdrop, props: res.staging.props, summary: sc.summary, mood: sc.mood,
    });

    // ---- actions ----
    const timed = (ta: TimedAction) => {
      const ln = sceneLines[ta.line];
      if (!ln) return null;
      const dur = ln.end - ln.start;
      let s = ln.start + ta.at * dur;
      let e = s + Math.max(MIN_DUR[ta.action.type], (ta.span ?? 1) * dur);
      const limit = end - TURN - 0.05;
      if (e > limit) { e = limit; s = Math.min(s, e - 0.2); }
      return { s, e };
    };
    const raw = res.staging.actions
      .map((ta, n) => ({ ta, n, tm: timed(ta) }))
      .filter((x) => {
        if (!x.tm) W(`action ${x.n + 1} points at line ${x.ta.line + 1}, which does not exist; dropped`);
        return !!x.tm;
      })
      .sort((a, b) => a.tm!.s - b.tm!.s);

    const entered = new Set<string>();
    const exited = new Set<string>();
    const lastMotion = new Map<string, TLAction>();
    const spot = (id: string): [number, number] => {
      const n = bible.characters.length;
      const idx = bible.characters.findIndex((c) => c.id === id);
      return [n <= 1 ? 0.5 : 0.25 + (0.5 * idx) / (n - 1), 0.8];
    };
    const push = (a: Action, s: number, e: number, line: number) => {
      const ta: TLAction = { id: `${i}:${actions.length}`, scene: i, line, start: s, end: e, action: a };
      actions.push(ta);
      return ta;
    };
    const autoEnter = (who: string, at: number, line: number) => {
      const [x] = spot(who);
      const s = Math.max(start + 0.3, at - MIN_DUR.enter);
      push({ type: "enter", who, from: x < 0.5 ? "left" : "right", to: spot(who) }, s, s + MIN_DUR.enter, line);
      entered.add(who);
    };

    for (const { ta, tm } of raw) {
      const a = ta.action;
      const { s, e } = tm!;
      if ("who" in a) {
        if (!charIds.has(a.who)) { W(`action names unknown character "${a.who}"; dropped`); continue; }
        if (exited.has(a.who) && a.type !== "enter") { W(`${a.who} acts after exiting; dropped`); continue; }
        if (a.type === "enter") {
          if (entered.has(a.who) && !exited.has(a.who)) {
            W(`${a.who} enters twice; treated as a walk`);
            push({ type: "walk_to", who: a.who, to: a.to }, s, e, ta.line);
            continue;
          }
          exited.delete(a.who);
          entered.add(a.who);
        } else if (!entered.has(a.who)) {
          W(`${a.who} acts before entering; auto-entered`);
          autoEnter(a.who, s, ta.line);
        }
        if (a.type === "exit") exited.add(a.who);
        if (a.type === "look_at" && !charIds.has(a.target) && !propIds.has(a.target)) {
          W(`look_at target "${a.target}" does not exist; dropped`);
          continue;
        }
        if (a.type === "enter" || a.type === "walk_to" || a.type === "exit") {
          const prev = lastMotion.get(a.who);
          if (prev && prev.end > s) {
            W(`conflicting moves on ${a.who}; the later one wins`);
            prev.end = Math.max(prev.start + 0.2, s);
          }
          lastMotion.set(a.who, push(a, s, e, ta.line));
          continue;
        }
        push(a, s, e, ta.line);
      } else if (a.type === "prop") {
        if (!propIds.has(a.id)) { W(`prop action names unknown prop "${a.id}"; dropped`); continue; }
        push(a, s, e, ta.line);
      } else if (a.type === "lights") {
        push(a, s, e, ta.line);
        lights.push({ t: s, mode: a.mode });
      } else {
        push(a, s, e, ta.line);
      }
    }
    // A character the story talks about must be visible: auto-enter it before its first line.
    for (const ln of sceneLines) {
      if (charIds.has(ln.character) && !entered.has(ln.character)) {
        W(`${ln.character} speaks without entering; auto-entered`);
        autoEnter(ln.character, ln.start + 0.2, ln.index);
      }
    }

    // ---- emphasis marks ----
    for (const ln of sceneLines) {
      if (!ln.decision.emphasis) continue;
      const target = ln.focus && (charIds.has(ln.focus) || propIds.has(ln.focus)) ? ln.focus : null;
      if (!target) continue; // caption underline handles it (UI)
      const agent = agentById.get(ln.agentId) ?? NARRATOR_AGENT_DEF;
      const kt = ln.keywordTime ?? ln.start + 0.35 * (ln.end - ln.start);
      const expr = ln.decision.expression;
      emphasis.push({
        scene: i, line: ln.index, start: Math.max(ln.start, kt - 0.05),
        end: Math.min(end - TURN, Math.max(ln.end + 0.8, kt + 1.4)),
        target, kind: expr === "happy" || expr === "proud" ? "sparkle" : charIds.has(target) ? "ring" : "around",
        ink: agent.ink,
      });
    }
  }

  const complete = ready === bible.scenes.length;
  lights.sort((a, b) => a.t - b.t);
  const tl: Timeline = {
    storyId: story.storyId, title: bible.title, startLights: bible.startLights,
    duration: cursor + (complete ? END_HOLD : 0), complete,
    characters: bible.characters, agents, scenes, lines, actions, emphasis, lights, warnings,
  };
  tl.warnings.push(...lint(tl));
  return tl;
}

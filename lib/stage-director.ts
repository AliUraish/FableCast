// Stage Director (readme 7.2): one Claude call per scene, run in parallel with routing.
// Output is validated (ids, line indexes, entrances, camera budget) and props are sanitised.
// On failure the keyword stager (lib/mock.ts) stages the scene, so a scene always plays.
import { sanitizeProps } from "@/engine/sanitize";
import { structured } from "./anthropic";
import { cached } from "./cache";
import { env, modes } from "./env";
import { claudeBudgetSpent } from "./limits";
import { heuristicStaging } from "./mock";
import { errMsg } from "./resilience";
import { SceneStaging, type StoryBible, type TimedAction } from "./schemas";

export const STAGING_PROMPT_VERSION = "staging-v4"; // v4: layered compositions, detailed hero props

const SYSTEM = [
  "You are the Stage Director for Fablecast, a bedtime storybook drawn by a pen while it is told.",
  "Stage ONE scene: choose one backdrop preset, 4 to 8 props, and timed actions. Output JSON only.",
  "",
  "DRAW THIS STORY, NOT A GENERIC ONE",
  "- Pick the backdrop that fits THIS scene's place (meadow, seaside, village, sky, hilltop, cave, bedroom, night_forest).",
  "  Do not default to night_forest: a home is a bedroom or village, water is seaside, flying is sky, open grass is meadow.",
  "- COMPOSE A FULL PICTURE in three layers: sky (moon, stars, bats, clouds), middle (a house, trees, the scene's big object),",
  "  and foreground (small props near the characters). Give every scene one big HERO object drawn custom (size 0.3-0.5).",
  "- Draw the objects the lines mention. At least 2 CUSTOM props drawn for this story's own things (a kite, a teapot, an igloo,",
  "  a snowflake, a boat, a cake...): 4 to 6 paths each, clean recognisable outlines PLUS inner details (windows, stripes,",
  "  planks, a face, a handle, buttons, leaves), drawn at size 0.15 or more so the details read. Use presets for generic things (moon, star, tree, house, cloud...). Big, obvious, easy for a child to read.",
  "- IT IS HALLOWEEN NIGHT: every scene also has at least 2 friendly Halloween props from the presets pumpkin (a jack-o'-lantern),",
  "  bat (high in the sky, y 0.1-0.3), web (in an upper corner), candy, ghost (a cute floating sheet ghost) and witch_hat,",
  "  placed where they make sense (a pumpkin by a door, bats across the moon, candy on the path). Cute and cozy, never scary.",
  "- INTERACTIVE: every prop tappable, with a fitting reaction (pop for balloons and bubbles, glow for lights, stars and magic,",
  "  wiggle for plants, animals and soft things). Reveal props with `appear` exactly when a line mentions them.",
  "",
  "STAGE: positions are normalised [x, y] in 0..1 (0,0 top-left). Characters stand on the ground: use y = 0.9 for them.",
  "Sky props (moon, star, cloud, sun) sit high (y 0.08-0.25). Ground props sit low (y 0.6-0.85). Props have size 0.05-0.6 (fraction of board height).",
  "Use presets first; only if nothing fits, give up to 6 custom paths (absolute M L C Q Z commands only, in a 0..100 box, a handful of curves).",
  "",
  "ACTIONS are relative to a line: `line` = index of the line in this scene, `at` 0..1 = where in the line it starts, `span` 0.1..1 = how long it lasts.",
  "- EVERY line must change something visible, usually 2 or 3 things: an entrance, a walk, a gesture, a prop appearing/moving,",
  "  a camera move, or the lights. Characters react to each other and to what is said (look_at, face, wave, jump, hug, shiver, peek).",
  "- Characters must `enter` (on or before their first line) before they act; they may `exit` afterwards.",
  "- Keep characters inside x 0.12..0.88 and spread out: at least 0.18 apart in x. Never stack characters on one spot.",
  "- Only reference ids that exist: the characters listed, and the props you define. A line's `focus` prop must be defined.",
  "- Use `lights` only when the story says the light changes. Use `camera` at most twice per scene, zoom at most 1.4.",
  "- A prop whose first action is `appear` is hidden until then: use that to reveal things as they are mentioned.",
].join("\n");

/** Validate and repair a staging so it can always be compiled. */
export function repairStaging(raw: SceneStaging, bible: StoryBible, sceneIdx: number): { staging: SceneStaging; warnings: string[] } {
  const scene = bible.scenes[sceneIdx];
  const warnings: string[] = [];
  const sp = sanitizeProps(raw.props);
  warnings.push(...sp.warnings);
  const props = sp.props;
  const charIds = new Set(bible.characters.map((c) => c.id));
  const propIds = new Set(props.map((p) => p.id));
  const known = (id: string) => charIds.has(id) || propIds.has(id);
  let cameras = 0;
  const actions: TimedAction[] = [];
  const entered = new Map<string, number>();
  const sorted = [...raw.actions].sort((a, b) => a.line - b.line || a.at - b.at);
  for (const ta of sorted) {
    if (ta.line < 0 || ta.line >= scene.lines.length) { warnings.push(`dropped action on missing line ${ta.line}`); continue; }
    const a = ta.action;
    if ("who" in a && !charIds.has(a.who)) { warnings.push(`dropped ${a.type} for unknown "${a.who}"`); continue; }
    if (a.type === "look_at" && !known(a.target)) { warnings.push(`dropped look_at unknown "${a.target}"`); continue; }
    if (a.type === "prop" && !propIds.has(a.id)) { warnings.push(`dropped prop action for unknown "${a.id}"`); continue; }
    if (a.type === "camera" && ++cameras > 2) { warnings.push("dropped extra camera move"); continue; }
    if (a.type === "enter") {
      if (entered.has(a.who)) { warnings.push(`dropped second enter for "${a.who}"`); continue; }
      entered.set(a.who, ta.line);
    } else if ("who" in a && !entered.has(a.who)) {
      // Acting before entering: bring them on at the start of this line.
      actions.push({ line: ta.line, at: 0, span: 0.4, action: { type: "enter", who: a.who, from: "left", to: [0.5, 0.9] } });
      entered.set(a.who, ta.line);
      warnings.push(`added enter for "${a.who}"`);
    }
    actions.push({ ...ta, at: Math.min(1, Math.max(0, ta.at)), span: Math.min(1, Math.max(0.1, ta.span ?? 1)) });
  }
  // Every line must change something visible: borrow from the keyword stager where a line is empty.
  const fallback = heuristicStaging(bible, sceneIdx);
  scene.lines.forEach((_l, i) => {
    if (actions.some((a) => a.line === i)) return;
    const onStage = [...entered.entries()].filter(([, line]) => line <= i).map(([id]) => id);
    const who = onStage[i % Math.max(1, onStage.length)];
    if (who) actions.push({ line: i, at: 0.2, span: 0.6, action: { type: "gesture", who, kind: i % 2 ? "shrug" : "wave" } });
    else {
      const borrowed = fallback.actions.find((a) => a.line === i && a.action.type === "enter");
      if (borrowed && borrowed.action.type === "enter") {
        actions.push(borrowed);
        entered.set(borrowed.action.who, i);
      } else if (props[0]) {
        actions.push({ line: i, at: 0.2, span: 0.5, action: { type: "prop", id: props[0].id, do: "move", to: [props[0].at[0], Math.max(0.05, props[0].at[1] - 0.03)] } });
      }
      warnings.push(`line ${i} had no visible change; added one`);
    }
  });
  actions.sort((a, b) => a.line - b.line || a.at - b.at);
  return { staging: { sceneId: scene.id, backdrop: raw.backdrop, props, actions: actions.slice(0, 30) }, warnings };
}

export interface Staged {
  staging: SceneStaging;
  source: "claude" | "mock" | "default" | "cache";
  tokens: number;
  warnings: string[];
}

export async function stageScene(bible: StoryBible, sceneIdx: number): Promise<Staged> {
  const e = env();
  const scene = bible.scenes[sceneIdx];
  const live = modes(e).claude === "live" && !claudeBudgetSpent();
  if (!live) return { staging: heuristicStaging(bible, sceneIdx), source: "mock", tokens: 0, warnings: [] };

  const inputs = {
    scene,
    characters: bible.characters.map((c) => ({ id: c.id, name: c.name, rig: c.rig, scale: c.scale })),
    worldNote: bible.worldNote,
    previous: bible.scenes[sceneIdx - 1]?.summary ?? null,
    model: e.stagingModel,
    v: STAGING_PROMPT_VERSION,
  };
  try {
    const r = await cached(
      "staging",
      inputs,
      async () => {
        const out = await structured({
          model: e.stagingModel,
          system: SYSTEM,
          prompt: JSON.stringify({
            worldNote: bible.worldNote,
            characters: inputs.characters,
            previousScene: inputs.previous,
            scene: { id: scene.id, summary: scene.summary, mood: scene.mood, lines: scene.lines.map((l, i) => ({ index: i, ...l })) },
          }),
          toolName: "scene_staging",
          schema: SceneStaging,
          maxTokens: 8000,
          timeoutMs: 60_000,
        });
        return { staging: out.value, tokens: out.tokens };
      },
    );
    const fixed = repairStaging(r.value.staging, bible, sceneIdx);
    return { staging: fixed.staging, source: r.hit ? "cache" : "claude", tokens: r.hit ? 0 : r.value.tokens, warnings: fixed.warnings };
  } catch (err) {
    return {
      staging: heuristicStaging(bible, sceneIdx),
      source: "default",
      tokens: 0,
      warnings: [`Stage Director failed (${errMsg(err).slice(0, 120)}); default staging used`],
    };
  }
}

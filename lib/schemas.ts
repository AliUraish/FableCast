// Data contracts (readme section 5). Claude outputs JSON only; everything is parsed with these.
import { z } from "zod";

export const ColorName = z.enum(["yellow", "blue", "orange", "pink", "green", "red", "purple", "white"]);
export type ColorName = z.infer<typeof ColorName>;
export const Pos = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]); // normalised stage coords
export type Pos = z.infer<typeof Pos>;

// ---- Mood agents (deployed by Claude per story) ----
export const MoodAgent = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/), // Jev choice key
  name: z.string(), // "Hush"
  mood: z.string(), // "calm, warm, near-whisper"
  routingHints: z.array(z.string()).min(2).max(5), // criteria text for Jev
  voiceTraits: z.object({
    age: z.enum(["child", "adult", "elder"]),
    gender: z.enum(["female", "male", "neutral"]),
    quality: z.string(), // "soft, breathy"
  }),
  tagPalette: z.tuple([z.array(z.string()), z.array(z.string()), z.array(z.string())]), // v3 tags by intensity [calm, clear, peak]
  voiceSettings: z.object({ stability: z.number().min(0).max(1), style: z.number().min(0).max(1) }),
  ink: ColorName, // ONE ink token per mood: emphasis marks and line style
  wobble: z.number().min(0).max(1.5), // line shakiness; scared moods wobble more
});
export type MoodAgent = z.infer<typeof MoodAgent>;

// ---- Characters (skins on top of hand-made rigs) ----
export const CharacterSkin = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string(),
  rig: z.enum(["biped", "blob"]),
  palette: z.object({ body: ColorName, accent: ColorName, outline: ColorName }),
  features: z.object({
    ears: z.enum(["none", "round", "pointy", "long"]).default("none"),
    tail: z.enum(["none", "short", "long", "fluffy"]).default("none"),
    horns: z.boolean().default(false),
    wings: z.boolean().default(false),
    spikes: z.boolean().default(false),
    eyes: z.enum(["dots", "round", "sleepy"]).default("dots"),
    accessory: z.enum(["none", "scarf", "hat", "cape", "glasses"]).default("none"),
  }),
  scale: z.number().min(0.6).max(1.6).default(1),
  // Who this character sounds like; casting picks a matching ElevenLabs voice (lib/casting.ts).
  voice: z.object({ gender: z.enum(["female", "male"]), age: z.enum(["child", "adult", "elder"]) }).optional(),
});
export type CharacterSkin = z.infer<typeof CharacterSkin>;

// ---- Story ----
// The family picks a tone on Home; it shapes the story and how the voices perform it (lib/tones.ts).
export const Tone = z.enum(["cozy", "silly", "adventure", "spooky", "dreamy"]);
export type Tone = z.infer<typeof Tone>;

export const Line = z.object({
  character: z.string(), // character id or "narrator": WHO the line is about; the voice is chosen by Jev
  text: z.string().min(1).max(220), // one spoken clause
  // The same words as `text`, acted: inline ElevenLabs v3 audio tags, timing punctuation, one CAPS word.
  performed: z.string().max(400).optional(),
  // Who SAYS the words: a character id for dialogue, else "narrator". Picks the voice.
  speaker: z.string().optional(),
  focus: z.string().optional(), // id of a character or prop the line draws attention to
  keyword: z.string().optional(), // a word in `text` where emphasis should land
});
export type Line = z.infer<typeof Line>;

export const Scene = z.object({
  id: z.number(),
  summary: z.string(),
  mood: z.string(),
  lines: z.array(Line).min(2).max(6),
});
export type Scene = z.infer<typeof Scene>;

export const StoryBible = z.object({
  title: z.string(),
  worldNote: z.string(), // setting, time of day, tone
  characters: z.array(CharacterSkin).min(1).max(4),
  agents: z.array(MoodAgent).min(3).max(6),
  scenes: z.array(Scene).min(3).max(6),
  startLights: z.enum(["night", "day"]),
  tone: Tone.optional(),
  narrator: z.object({ gender: z.enum(["female", "male"]) }).optional(),
});
export type StoryBible = z.infer<typeof StoryBible>;

// ---- Stage Director output (one call per scene) ----
export const PenPath = z.object({
  d: z.string().max(600), // SVG path, ONLY M L C Q Z (absolute), in a 0..100 local box
  color: ColorName.optional(),
  width: z.number().min(1).max(8).optional(),
});
export type PenPath = z.infer<typeof PenPath>;

export const PropPreset = z.enum([
  "moon", "star", "tree", "house", "cave", "bed", "lantern", "rock",
  "cloud", "flower", "door", "hill", "box", "bush", "sun", "window",
]);
export type PropPreset = z.infer<typeof PropPreset>;

export const Prop = z.object({
  id: z.string(),
  preset: PropPreset.optional(),
  custom: z.array(PenPath).max(6).optional(), // used when no preset fits
  at: Pos,
  size: z.number().min(0.05).max(0.6), // fraction of board height
  tappable: z.boolean().default(true),
  reaction: z.enum(["wiggle", "pop", "glow"]).default("wiggle"),
});
export type Prop = z.infer<typeof Prop>;

export const GestureKind = z.enum(["wave", "point", "jump", "shrug", "hug", "hide", "peek", "spin", "sleep", "shiver"]);
export type GestureKind = z.infer<typeof GestureKind>;
export const Side = z.enum(["left", "right", "top", "bottom"]);

export const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enter"), who: z.string(), from: Side, to: Pos }),
  z.object({ type: z.literal("walk_to"), who: z.string(), to: Pos }),
  z.object({ type: z.literal("face"), who: z.string(), dir: z.enum(["left", "right"]) }),
  z.object({ type: z.literal("look_at"), who: z.string(), target: z.string() }),
  z.object({ type: z.literal("gesture"), who: z.string(), kind: GestureKind }),
  z.object({ type: z.literal("exit"), who: z.string(), to: Side }),
  z.object({ type: z.literal("prop"), id: z.string(), do: z.enum(["appear", "disappear", "move"]), to: Pos.optional() }),
  z.object({ type: z.literal("camera"), focus: Pos, zoom: z.number().min(1).max(1.4) }),
  z.object({ type: z.literal("lights"), mode: z.enum(["night", "day"]) }),
]);
export type Action = z.infer<typeof Action>;

export const TimedAction = z.object({
  line: z.number().int().min(0), // line index within the scene
  at: z.number().min(0).max(1), // where in the line the action starts
  span: z.number().min(0.1).max(1).default(1), // how much of the line it lasts
  action: Action,
});
export type TimedAction = z.infer<typeof TimedAction>;

export const Backdrop = z.enum(["night_forest", "cave", "bedroom", "meadow", "seaside", "village", "sky", "hilltop"]);
export type Backdrop = z.infer<typeof Backdrop>;

export const SceneStaging = z.object({
  sceneId: z.number(),
  backdrop: Backdrop,
  props: z.array(Prop).max(8),
  actions: z.array(TimedAction).max(30),
});
export type SceneStaging = z.infer<typeof SceneStaging>;

// ---- Jev decisions (per line) ----
export const Expression = z.enum(["neutral", "happy", "curious", "worried", "scared", "sleepy", "proud"]);
export type Expression = z.infer<typeof Expression>;
export const LineDecision = z.object({
  agentId: z.string(),
  intensity: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  pause: z.enum(["none", "short", "long"]),
  expression: Expression,
  emphasis: z.boolean(),
  probabilities: z.record(z.number()).optional(), // speaker choice probabilities, for Director's View
  latencyMs: z.number(),
  cacheHit: z.boolean(),
  source: z.enum(["jev", "claude", "default", "mock"]).default("default"),
});
export type LineDecision = z.infer<typeof LineDecision>;

export const NARRATOR = "narrator";
export const NARRATOR_AGENT = "narrator_default";

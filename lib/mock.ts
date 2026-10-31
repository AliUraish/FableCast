// Deterministic, no-key stand-ins for Claude and Jev. This is what plays when no provider keys are set,
// so it has to be a real story: a hero from the premise, a friend, a lights-out moment, a cosy ending.
// heuristicStaging() is also the default staging fallback for Claude-written stories.
import {
  NARRATOR, NARRATOR_AGENT, type Action, type Backdrop, type CharacterSkin, type Expression, type LineDecision,
  type MoodAgent, type Prop, type PropPreset, type SceneStaging, type StoryBible, type TimedAction,
} from "./schemas";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T,>(arr: T[], seed: number) => arr[seed % arr.length];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- premise parsing ----------
type Feat = Partial<CharacterSkin["features"]>;
interface Creature { noun: string; rig: "biped" | "blob"; features: Feat; scale?: number }

const CREATURES: Record<string, Creature> = {
  dragon: { noun: "dragon", rig: "biped", features: { horns: true, wings: true, spikes: true, tail: "long" }, scale: 1.15 },
  dinosaur: { noun: "dinosaur", rig: "biped", features: { spikes: true, tail: "long" }, scale: 1.15 },
  bunny: { noun: "bunny", rig: "biped", features: { ears: "long", tail: "fluffy" } },
  rabbit: { noun: "rabbit", rig: "biped", features: { ears: "long", tail: "fluffy" } },
  cat: { noun: "cat", rig: "biped", features: { ears: "pointy", tail: "long" } },
  kitten: { noun: "kitten", rig: "biped", features: { ears: "pointy", tail: "long" }, scale: 0.85 },
  fox: { noun: "fox", rig: "biped", features: { ears: "pointy", tail: "fluffy" } },
  wolf: { noun: "wolf", rig: "biped", features: { ears: "pointy", tail: "fluffy" } },
  dog: { noun: "dog", rig: "biped", features: { ears: "long", tail: "short" } },
  puppy: { noun: "puppy", rig: "biped", features: { ears: "long", tail: "short" }, scale: 0.85 },
  bear: { noun: "bear", rig: "biped", features: { ears: "round", tail: "short" }, scale: 1.2 },
  mouse: { noun: "mouse", rig: "biped", features: { ears: "round", tail: "long" }, scale: 0.75 },
  raccoon: { noun: "raccoon", rig: "biped", features: { ears: "round", tail: "fluffy", accessory: "glasses" } },
  squirrel: { noun: "squirrel", rig: "biped", features: { ears: "pointy", tail: "fluffy" }, scale: 0.8 },
  hedgehog: { noun: "hedgehog", rig: "biped", features: { spikes: true, ears: "round" }, scale: 0.8 },
  owl: { noun: "owl", rig: "biped", features: { wings: true, eyes: "round" } },
  bird: { noun: "bird", rig: "biped", features: { wings: true, tail: "short" }, scale: 0.8 },
  penguin: { noun: "penguin", rig: "biped", features: { wings: true } },
  duck: { noun: "duck", rig: "biped", features: { wings: true, tail: "short" } },
  unicorn: { noun: "unicorn", rig: "biped", features: { horns: true, tail: "long", ears: "pointy" } },
  monster: { noun: "monster", rig: "biped", features: { horns: true, spikes: true, eyes: "round" }, scale: 1.2 },
  robot: { noun: "robot", rig: "biped", features: { eyes: "round", accessory: "hat" } },
  lion: { noun: "lion", rig: "biped", features: { ears: "round", tail: "long" }, scale: 1.15 },
  tiger: { noun: "tiger", rig: "biped", features: { ears: "round", tail: "long" }, scale: 1.1 },
  pig: { noun: "pig", rig: "biped", features: { ears: "pointy", tail: "short" } },
  frog: { noun: "frog", rig: "blob", features: { eyes: "round" } },
  turtle: { noun: "turtle", rig: "blob", features: { eyes: "sleepy" } },
  snail: { noun: "snail", rig: "blob", features: { eyes: "round" }, scale: 0.8 },
  ghost: { noun: "ghost", rig: "blob", features: { eyes: "round" } },
  slime: { noun: "slime", rig: "blob", features: { eyes: "dots" } },
  jelly: { noun: "jelly", rig: "blob", features: { eyes: "dots" } },
  bean: { noun: "bean", rig: "blob", features: { eyes: "dots" }, scale: 0.8 },
  cloud: { noun: "cloud", rig: "blob", features: { eyes: "sleepy" } },
  star: { noun: "star", rig: "blob", features: { spikes: true, eyes: "round" } },
  moon: { noun: "moon", rig: "blob", features: { eyes: "sleepy" } },
  blob: { noun: "blob", rig: "blob", features: {} },
  octopus: { noun: "octopus", rig: "blob", features: { eyes: "round" } },
  girl: { noun: "girl", rig: "biped", features: { accessory: "scarf" } },
  boy: { noun: "boy", rig: "biped", features: { accessory: "hat" } },
  child: { noun: "child", rig: "biped", features: { accessory: "scarf" } },
  princess: { noun: "princess", rig: "biped", features: { accessory: "cape" } },
  knight: { noun: "knight", rig: "biped", features: { accessory: "cape" } },
  wizard: { noun: "wizard", rig: "biped", features: { accessory: "hat" } },
};
const ALIAS: Record<string, string> = { bunnies: "bunny", cats: "cat", dragons: "dragon", kitty: "kitten", owlet: "owl", dino: "dinosaur", pup: "puppy" };

const ADJECTIVES = new Set([
  "sleepy", "little", "tiny", "small", "big", "brave", "shy", "lonely", "grumpy", "curious", "silly", "gentle", "clumsy",
  "happy", "sad", "scared", "fluffy", "young", "old", "wise", "kind", "quiet", "noisy", "giant", "baby", "lost", "hungry",
  "purple", "blue", "red", "green", "yellow", "orange", "pink", "white", "black", "golden", "silver", "spotty", "stripy",
]);

const NAMES = ["Pip", "Ember", "Moss", "Bramble", "Juniper", "Tumble", "Nutmeg", "Pebble", "Clover", "Wren", "Biscuit", "Sprout"];

interface Parsed { adj: string; creature: Creature; problem: string; place: Backdrop; placeNoun: string; name: string; seed: number }

function placeOf(text: string): { place: Backdrop; placeNoun: string } {
  const t = text.toLowerCase();
  if (/\b(sea|ocean|beach|shore|wave|island)/.test(t)) return { place: "seaside", placeNoun: "seaside" };
  if (/\b(sky|cloud|fly|flying|space|stars?)\b/.test(t)) return { place: "sky", placeNoun: "sky" };
  if (/\b(cave|mountain|tunnel)/.test(t)) return { place: "cave", placeNoun: "cave" };
  if (/\b(village|town|city|street)/.test(t)) return { place: "village", placeNoun: "village" };
  if (/\b(bed|bedroom|room|house|home)/.test(t)) return { place: "bedroom", placeNoun: "little room" };
  if (/\b(meadow|field|garden|farm|flower)/.test(t)) return { place: "meadow", placeNoun: "meadow" };
  if (/\b(hill|hilltop)/.test(t)) return { place: "hilltop", placeNoun: "hilltop" };
  return { place: "night_forest", placeNoun: "forest" };
}

function problemOf(premise: string, noun: string): string {
  const m = premise.match(/\b(?:who|that|which)\s+(.+)$/i);
  let p = m ? m[1] : "";
  if (!p) {
    const after = premise.toLowerCase().split(noun)[1]?.trim();
    p = after && after.length > 3 ? after : "";
  }
  p = p.replace(/[.!?]+$/, "").trim();
  if (!p) return "was a little bit afraid of the dark";
  // Present -> past tense on the first verb; the first rule that matches wins.
  const rules: [RegExp, string][] = [
    [/^is\b/i, "was"], [/^are\b/i, "were"], [/^(can't|cannot)\b/i, "could not"], [/^can\b/i, "could"],
    [/^hates\b/i, "did not like"], [/^has\b/i, "had"], [/^(doesn't|does not)\b/i, "did not"], [/^won't\b/i, "would not"],
    [/^(was|were|had|did|could|would)\b/i, "$1"], [/^hides\b/i, "hid"], [/^runs\b/i, "ran"], [/^sees\b/i, "saw"],
    [/^goes\b/i, "went"], [/^makes\b/i, "made"], [/^gets\b/i, "got"], [/^flies\b/i, "flew"], [/^eats\b/i, "ate"],
    [/^sleeps\b/i, "slept"], [/^feels\b/i, "felt"], [/^keeps\b/i, "kept"], [/^(\w+?)ies\b/i, "$1ied"], [/^(\w+?e)s\b/i, "$1d"], [/^(\w+)s\b/i, "$1ed"],
  ];
  const rule = rules.find(([re]) => re.test(p));
  let out = (rule ? p.replace(rule[0], rule[1]) : p).replace(/\byour\b/gi, "the");
  if (out.length > 90) out = out.slice(0, 90).replace(/\s+\S*$/, "");
  return out;
}

export function parsePremise(premise: string): Parsed {
  const seed = hash(premise.toLowerCase().trim());
  const words = premise.toLowerCase().replace(/[^a-z'\s-]/g, " ").split(/\s+/).filter(Boolean);
  let creature: Creature | undefined;
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    const w = ALIAS[words[i]] ?? words[i];
    if (CREATURES[w]) { creature = CREATURES[w]; idx = i; break; }
  }
  if (!creature) {
    // Unknown creature: use the first content word after an article as the noun.
    const art = words.findIndex((w) => w === "a" || w === "an" || w === "the");
    let i = art >= 0 ? art + 1 : 0;
    while (i < words.length - 1 && ADJECTIVES.has(words[i])) i++;
    const noun = (words[i] && !["who", "that", "is"].includes(words[i]) ? words[i] : "creature").slice(0, 16);
    creature = { noun, rig: hash(noun) % 3 === 0 ? "blob" : "biped", features: { ears: "round", tail: "short" } };
    idx = i;
  }
  let adj = idx > 0 && ADJECTIVES.has(words[idx - 1]) ? words[idx - 1] : "";
  if (!adj && idx > 1 && ADJECTIVES.has(words[idx - 2])) adj = words[idx - 2];
  return {
    adj: adj || pick(["little", "small", "gentle"], seed),
    creature,
    problem: problemOf(premise, creature.noun),
    ...placeOf(premise),
    name: pick(NAMES, seed),
    seed,
  };
}

// ---------- mood agents ----------
export const MOCK_AGENTS: MoodAgent[] = [
  {
    id: "hush", name: "Hush", mood: "calm, warm, near-whisper storyteller",
    routingHints: ["calm narration and scene setting", "gentle, sleepy or cosy moments", "quiet transitions between events"],
    voiceTraits: { age: "adult", gender: "female", quality: "soft, warm, gentle" },
    tagPalette: [["softly"], ["warmly"], ["gently", "slowly"]],
    voiceSettings: { stability: 1, style: 0.2 }, ink: "white", wobble: 0.2,
  },
  {
    id: "wonder", name: "Wonder", mood: "curious, bright, wide-eyed",
    routingHints: ["questions, discoveries and surprises", "meeting someone new", "looking at something amazing"],
    voiceTraits: { age: "child", gender: "female", quality: "bright, playful, curious" },
    tagPalette: [["curious"], ["excited"], ["gasps", "excited"]],
    voiceSettings: { stability: 0.5, style: 0.6 }, ink: "yellow", wobble: 0.4,
  },
  {
    id: "shiver", name: "Shiver", mood: "fearful, trembling, small",
    routingHints: ["fear, darkness and strange noises", "nervous whispers", "the scary moment of the story"],
    voiceTraits: { age: "child", gender: "male", quality: "small, nervous, shaky" },
    tagPalette: [["nervous"], ["whispers", "nervous"], ["scared", "whispers"]],
    voiceSettings: { stability: 0, style: 0.7 }, ink: "blue", wobble: 1.2,
  },
  {
    id: "glow", name: "Glow", mood: "warm relief, proud and kind",
    routingHints: ["relief, comfort and kindness", "bravery and pride", "friendship, hugs and happy endings"],
    voiceTraits: { age: "adult", gender: "male", quality: "warm, kind, charming" },
    tagPalette: [["warmly"], ["happy"], ["laughs", "happy"]],
    voiceSettings: { stability: 0.5, style: 0.5 }, ink: "orange", wobble: 0.3,
  },
];

function skin(id: string, name: string, c: Creature, body: CharacterSkin["palette"]["body"]): CharacterSkin {
  return {
    id, name, rig: c.rig,
    palette: { body, accent: "yellow", outline: "white" },
    features: {
      ears: "none", tail: "none", horns: false, wings: false, spikes: false, eyes: "dots", accessory: "none",
      ...c.features,
    },
    scale: c.scale ?? 1,
  };
}

/** A deterministic four-scene story from any premise. */
export function mockBible(premise: string): StoryBible {
  const p = parsePremise(premise);
  const N = p.name;
  const n = p.creature.noun;
  const heroId = n.replace(/[^a-z0-9]/g, "_").replace(/^[^a-z]+/, "") || "hero";
  const friendIsOwl = p.creature.rig === "blob";
  const friend: Creature = friendIsOwl
    ? { noun: "owl", rig: "biped", features: { wings: true, eyes: "round" }, scale: 0.9 }
    : { noun: "glow-bug", rig: "blob", features: { wings: true, eyes: "round" }, scale: 0.7 };
  const M = friendIsOwl ? "Olive" : "Luma";
  const friendId = heroId === M.toLowerCase() ? "friend" : M.toLowerCase();
  const fk = friendIsOwl ? "wise old owl" : "tiny glow-bug";
  const place = p.placeNoun;

  return {
    title: `${N} and the ${cap(p.adj)} Night`.slice(0, 60),
    worldNote: `A quiet ${place} at dusk, turning to a starry night. Gentle, cosy, safe. Hero: ${N} the ${p.adj} ${n}; friend: ${M} the ${fk}.`,
    characters: [skin(heroId, N, p.creature, "blue"), skin(friendId, M, friend, "orange")],
    agents: MOCK_AGENTS,
    startLights: "day",
    scenes: [
      {
        id: 0, summary: `${N} the ${p.adj} ${n} at home in the ${place}.`, mood: "calm, warm",
        lines: [
          { character: NARRATOR, text: `Once upon a time, in a quiet ${place}, there lived a ${p.adj} ${n} named ${N}.`, focus: heroId, keyword: N },
          { character: heroId, text: `Every evening, ${N} watched the big round moon rise.`, focus: "moon", keyword: "moon" },
          { character: heroId, text: `But ${N} ${p.problem}.`.replace(/\.\.$/, ".") },
          { character: NARRATOR, text: `So tonight, ${N} decided to be very brave.`, keyword: "brave" },
        ],
      },
      {
        id: 1, summary: `The lights go out and ${N} hears a sound.`, mood: "worried, a little scary",
        lines: [
          { character: NARRATOR, text: "Then, all at once, the lights went out.", keyword: "out" },
          { character: heroId, text: `${N} began to shiver and shake.`, focus: heroId, keyword: "shiver" },
          { character: heroId, text: `"Who is there?" whispered ${N}.` },
          { character: NARRATOR, text: "Something tiny was glowing behind the bush.", focus: "bush", keyword: "glowing" },
        ],
      },
      {
        id: 2, summary: `${M} the ${fk} shows ${N} the night sky.`, mood: "curious, brave",
        lines: [
          { character: friendId, text: `"Hello! I am ${M}," said a little ${fk}.`, focus: friendId, keyword: M },
          { character: friendId, text: `"The dark is just the sky in its pajamas."`, keyword: "pajamas" },
          { character: heroId, text: `${N} peeked up and saw a thousand twinkling stars.`, focus: "star", keyword: "stars" },
          { character: NARRATOR, text: "Together, they danced under the bright round moon.", focus: "moon", keyword: "danced" },
        ],
      },
      {
        id: 3, summary: `${N} falls asleep, safe and warm.`, mood: "sleepy, comforting",
        lines: [
          { character: NARRATOR, text: `Soon, ${N} gave a great big yawn.`, keyword: "yawn" },
          { character: friendId, text: `"Goodnight, ${N}. I will glow right here," said ${M}.`, focus: friendId, keyword: "glow" },
          { character: heroId, text: `${N} curled up, cozy and warm, and smiled.`, focus: heroId },
          { character: NARRATOR, text: "And the dark felt soft, and kind, and safe.", keyword: "safe" },
        ],
      },
    ],
  };
}

// ---------- staging ----------
const SKY: PropPreset[] = ["moon", "star", "cloud", "sun"];
const PROP_SIZE: Record<PropPreset, number> = {
  moon: 0.13, star: 0.07, cloud: 0.15, sun: 0.14, tree: 0.46, house: 0.4, cave: 0.45, bed: 0.28, lantern: 0.14,
  rock: 0.13, flower: 0.12, door: 0.34, hill: 0.32, box: 0.13, bush: 0.18, window: 0.2,
  pumpkin: 0.16, bat: 0.08, web: 0.2, candy: 0.08, ghost: 0.2, witch_hat: 0.14,
};
const PROP_WORDS: [RegExp, PropPreset][] = [
  [/\bmoon/, "moon"], [/\bstars?\b|twinkl/, "star"], [/\bcloud/, "cloud"], [/\bsun\b|sunrise|morning/, "sun"],
  [/\btrees?\b|forest/, "tree"], [/\bhouse|home|cottage/, "house"], [/\bcave/, "cave"], [/\bbed\b|pillow|blanket/, "bed"],
  [/lantern|glow|light\b|candle/, "lantern"], [/\brocks?\b|stone|pebble/, "rock"], [/flower|petal/, "flower"],
  [/\bdoor/, "door"], [/\bhill/, "hill"], [/\bbox|present|chest/, "box"], [/\bbush|hedge|leaves/, "bush"], [/window/, "window"],
];
const BACKDROP_DEFAULT_PROPS: Record<Backdrop, PropPreset[]> = {
  night_forest: ["tree", "moon"], cave: ["rock", "lantern"], bedroom: ["bed", "window"], meadow: ["flower", "cloud"],
  seaside: ["rock", "cloud"], village: ["house", "moon"], sky: ["cloud", "star"], hilltop: ["hill", "moon"],
};

function backdropFor(bible: StoryBible, sceneIdx: number): Backdrop {
  const scene = bible.scenes[sceneIdx];
  const text = `${scene.summary} ${scene.lines.map((l) => l.text).join(" ")}`.toLowerCase();
  if (/\bbed\b|bedroom|pillow|blanket/.test(text)) return "bedroom";
  if (/\bcave\b/.test(text)) return "cave";
  const world = placeOf(bible.worldNote).place;
  if (world !== "night_forest") return world;
  // "at home" or "a house" in a line is not a reason to leave the story's world for a bedroom.
  return placeOf(text.replace(/\b(home|house|room)\b/g, " ")).place;
}

function presetFor(id: string): PropPreset | undefined {
  const t = id.toLowerCase();
  for (const [re, preset] of PROP_WORDS) if (re.test(t)) return preset;
  return undefined;
}

const VERB_GESTURE: [RegExp, Extract<Action, { type: "gesture" }>["kind"]][] = [
  [/shiver|shake|trembl|cold/, "shiver"], [/\bjump|\bhop|leap|bounce/, "jump"], [/\bwave|hello|\bhi\b|goodbye/, "wave"],
  [/\bhid|\bhide/, "hide"], [/peek|peep/, "peek"], [/spin|danc|twirl/, "spin"], [/\bhug|together|cuddle/, "hug"],
  [/point|look|saw|see\b|watch/, "point"], [/yawn|sleep|curled|goodnight|snooze|dream/, "sleep"], [/shrug|wonder|maybe/, "shrug"],
];

/**
 * Keyword stager: every line changes something visible (an entrance, a walk, a gesture, a prop, the lights
 * or the camera). Used for mock stories and as the default when the Stage Director fails.
 */
export function heuristicStaging(bible: StoryBible, sceneIdx: number): SceneStaging {
  const scene = bible.scenes[sceneIdx];
  const charIds = new Set(bible.characters.map((c) => c.id));
  const backdrop = backdropFor(bible, sceneIdx);
  const actions: TimedAction[] = [];
  const props: Prop[] = [];
  const propIds = new Set<string>();
  const seed = hash(`${bible.title}:${sceneIdx}`);

  // Who is in this scene, in order of first appearance.
  const cast: string[] = [];
  const firstLine = new Map<string, number>();
  scene.lines.forEach((l, i) => {
    for (const id of [l.character, l.focus]) {
      if (id && charIds.has(id) && !firstLine.has(id)) { firstLine.set(id, i); cast.push(id); }
    }
  });
  // The stage is never empty on line 0, and characters carried over from the last page are back at once.
  const prevScene = bible.scenes[sceneIdx - 1];
  const prevCast = new Set(prevScene ? prevScene.lines.flatMap((l) => [l.character, l.focus ?? ""]) : []);
  cast.forEach((id, k) => {
    if (k === 0 || prevCast.has(id)) firstLine.set(id, 0);
  });
  cast.sort((a, b) => firstLine.get(a)! - firstLine.get(b)!);
  const entered = (id: string | undefined, i: number) => !!id && (firstLine.get(id) ?? 99) < i;
  const slots = cast.length <= 1 ? [0.45] : cast.length === 2 ? [0.32, 0.66] : cast.length === 3 ? [0.22, 0.5, 0.78] : [0.18, 0.4, 0.62, 0.84];
  const xOf = new Map(cast.map((id, i) => [id, slots[i]]));

  // Props: backdrop defaults (present from the start) plus anything a line mentions (appears on that line).
  let gx = 0;
  const groundX = [0.1, 0.9, 0.55, 0.78, 0.25];
  let sx = 0;
  const skyX = [0.8, 0.2, 0.55, 0.35];
  const addProp = (id: string, preset: PropPreset, line: number | null) => {
    if (propIds.has(id) || props.length >= 6) return;
    propIds.add(id);
    const sky = SKY.includes(preset);
    const at: [number, number] = sky ? [skyX[sx++ % skyX.length], preset === "star" ? 0.1 : 0.16] : [groundX[gx++ % groundX.length], preset === "tree" || preset === "house" || preset === "cave" || preset === "door" ? 0.62 : 0.84];
    props.push({ id, preset, at, size: PROP_SIZE[preset], tappable: true, reaction: preset === "lantern" || preset === "star" || preset === "moon" ? "glow" : preset === "box" || preset === "flower" ? "pop" : "wiggle" });
    if (line !== null && line > 0) actions.push({ line, at: 0.1, span: 0.5, action: { type: "prop", id, do: "appear" } });
  };
  for (const preset of BACKDROP_DEFAULT_PROPS[backdrop]) addProp(preset, preset, null);
  scene.lines.forEach((l, i) => {
    if (l.focus && !charIds.has(l.focus)) addProp(l.focus, presetFor(l.focus) ?? "rock", i);
    const t = l.text.toLowerCase();
    for (const [re, preset] of PROP_WORDS) if (re.test(t) && !propIds.has(preset)) addProp(preset, preset, i);
  });
  // A few extra stars make a starry sky read as stars.
  if (propIds.has("star")) {
    const starLine = scene.lines.findIndex((l) => /stars?\b|twinkl/.test(l.text.toLowerCase()));
    for (const [k, at] of ([[1, [0.35, 0.08]], [2, [0.62, 0.18]]] as [number, [number, number]][])) {
      const id = `star_${k}`;
      if (props.length >= 8) break;
      propIds.add(id);
      props.push({ id, preset: "star", at, size: 0.05, tappable: true, reaction: "glow" });
      if (starLine > 0) actions.push({ line: starLine, at: 0.25 + k * 0.15, span: 0.4, action: { type: "prop", id, do: "appear" } });
    }
  }

  let camera = false;
  let lights = false;
  const facingLeft = new Map<string, boolean>();
  scene.lines.forEach((l, i) => {
    const before = actions.length;
    const t = l.text.toLowerCase();
    // Entrances on the line where a character first appears.
    cast.forEach((id, k) => {
      if (firstLine.get(id) !== i) return;
      const x = xOf.get(id)!;
      const from = x < 0.5 ? "left" : "right";
      actions.push({ line: i, at: Math.min(0.5, k * 0.15), span: 0.7, action: { type: "enter", who: id, from, to: [x, 0.9] } });
      facingLeft.set(id, from === "right");
    });
    // Lights.
    if (!lights && /lights? (went|go|goes) out|went dark|grew dark|darkness fell|night fell|lights out/.test(t)) {
      actions.push({ line: i, at: 0.45, span: 0.3, action: { type: "lights", mode: "night" } });
      lights = true;
    } else if (!lights && /sun (rose|came up)|morning came|lights? came (back )?on/.test(t)) {
      actions.push({ line: i, at: 0.4, span: 0.3, action: { type: "lights", mode: "day" } });
      lights = true;
    }
    // Who acts on this line.
    const named = [l.character, l.focus].find((id) => id && charIds.has(id));
    const onStage = cast.filter((id) => entered(id, i));
    const actor = entered(named, i) ? named : onStage[(i + seed) % Math.max(1, onStage.length)];
    if (actor) {
      let gesture: Extract<Action, { type: "gesture" }>["kind"] | undefined;
      for (const [re, g] of VERB_GESTURE) if (re.test(t)) { gesture = g; break; }
      if (gesture === "hug" && cast.length > 1) {
        const other = cast.find((c) => c !== actor)!;
        const ox = xOf.get(other)!;
        const ax = xOf.get(actor)!;
        const meet = (ax + ox) / 2;
        actions.push({ line: i, at: 0, span: 0.5, action: { type: "walk_to", who: actor, to: [meet + (ax < ox ? -0.08 : 0.08), 0.9] } });
        actions.push({ line: i, at: 0.55, span: 0.4, action: { type: "gesture", who: actor, kind: "spin" } });
        xOf.set(actor, meet + (ax < ox ? -0.08 : 0.08));
      } else if (gesture) {
        actions.push({ line: i, at: 0.2, span: 0.6, action: { type: "gesture", who: actor, kind: gesture } });
      } else if (/walk|went|came|crept|step|ran|run|tiptoe|follow/.test(t)) {
        const x = Math.min(0.85, Math.max(0.15, (xOf.get(actor) ?? 0.5) + (i % 2 ? -0.12 : 0.12)));
        actions.push({ line: i, at: 0.1, span: 0.8, action: { type: "walk_to", who: actor, to: [x, 0.9] } });
        xOf.set(actor, x);
      }
      if (l.focus && propIds.has(l.focus) && actions.length === before) {
        actions.push({ line: i, at: 0.2, span: 0.5, action: { type: "look_at", who: actor, target: l.focus } });
        actions.push({ line: i, at: 0.3, span: 0.5, action: { type: "gesture", who: actor, kind: "point" } });
      }
    }
    // Camera: one gentle push-in on the most dramatic line of the scene.
    if (!camera && l.keyword && l.focus && i > 0 && actions.length === before) {
      const target = charIds.has(l.focus) ? [xOf.get(l.focus) ?? 0.5, 0.7] : props.find((p) => p.id === l.focus)?.at ?? [0.5, 0.5];
      actions.push({ line: i, at: 0.2, span: 0.7, action: { type: "camera", focus: [target[0], target[1]] as [number, number], zoom: 1.2 } });
      camera = true;
    }
    // Still nothing visible? Something small moves: a face turn or a gesture by mood.
    if (actions.length === before) {
      const who = actor;
      if (who) {
        const left = !facingLeft.get(who);
        facingLeft.set(who, left);
        const kind = /sleep|yawn|cozy|cosy|soft|safe|end/.test(t + scene.mood) ? "sleep" : /scar|worr|afraid|dark/.test(t + scene.mood) ? "shiver" : i % 2 ? "shrug" : "wave";
        actions.push({ line: i, at: 0.15, span: 0.6, action: { type: "gesture", who, kind } });
      } else {
        const prop = props[i % Math.max(1, props.length)];
        if (prop) actions.push({ line: i, at: 0.2, span: 0.6, action: { type: "prop", id: prop.id, do: "move", to: [prop.at[0], Math.max(0.05, prop.at[1] - 0.04)] } });
      }
    }
  });
  // Close the camera back out on the last line if it moved.
  if (camera) actions.push({ line: scene.lines.length - 1, at: 0.1, span: 0.6, action: { type: "camera", focus: [0.5, 0.5], zoom: 1 } });

  return { sceneId: scene.id, backdrop, props: props.slice(0, 8), actions: actions.slice(0, 30) };
}

// ---------- mock Jev ----------
const AGENT_WORDS: Record<string, RegExp> = {
  shiver: /\b(dark|shiver|shake|scar|afraid|fear|who is there|whisper|out|creak|noise|alone|lost|cold|tremb)/,
  wonder: /\b(hello|saw|see|stars?|what|peek|glowing|wonder|look|amazing|new|discover|surprise)\b|\?/,
  glow: /\b(together|danc|smile|safe|warm|glow|hug|kind|brave|happy|goodnight|friend|proud|love)/,
  hush: /\b(once upon|soon|yawn|sleep|quiet|evening|decided|night|cozy|cosy|end)\b/,
};

function overlap(text: string, agent: MoodAgent): number {
  const words = new Set(text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
  let s = 0;
  for (const w of `${agent.mood} ${agent.routingHints.join(" ")}`.toLowerCase().split(/[^a-z]+/)) {
    if (w.length > 3 && words.has(w)) s += 0.5;
  }
  return s;
}

/** Keyword/mood heuristic decision for one line (the no-key stand-in for Jev). */
export function mockDecision(bible: StoryBible, sceneIdx: number, lineIdx: number): LineDecision {
  const scene = bible.scenes[sceneIdx];
  const line = scene.lines[lineIdx];
  const t = `${line.text}`.toLowerCase();
  const mood = scene.mood.toLowerCase();
  const scores: Record<string, number> = {};
  for (const a of bible.agents) {
    let s = overlap(`${line.text} ${scene.mood}`, a);
    const re = AGENT_WORDS[a.id];
    if (re && re.test(t)) s += 2;
    if (re && re.test(mood)) s += 0.6;
    if (line.character === NARRATOR && /calm|narrat|storyteller/.test(a.mood + a.routingHints.join(" "))) s += 0.8;
    scores[a.id] = s;
  }
  const max = Math.max(...Object.values(scores));
  const exps = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.exp((v - max) * 1.6)]));
  const total = Object.values(exps).reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(Object.entries(exps).map(([k, v]) => [k, Math.round((v / total) * 100) / 100]));
  const [top, p] = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0] ?? [NARRATOR_AGENT, 0];
  const agentId = p >= 0.4 ? top : NARRATOR_AGENT;
  const agent = bible.agents.find((a) => a.id === agentId);
  const peak = /!|lights? went out|who is there|all at once|suddenly/.test(t);
  const calm = /once upon|soon|yawn|soft|safe|evening/.test(t);
  const intensity: 0 | 1 | 2 = peak ? 2 : calm ? 0 : 1;
  const last = lineIdx === scene.lines.length - 1;
  const pause = last ? "long" : /\?|\.\.\.|…|then\b/.test(t) || peak ? "short" : lineIdx % 2 ? "short" : "none";
  const am = `${agent?.id ?? ""} ${agent?.mood ?? ""}`.toLowerCase();
  let expression: Expression = "neutral";
  if (/yawn|sleep|curled|goodnight|cozy|dream/.test(t)) expression = "sleepy";
  else if (/brave|proud/.test(t)) expression = "proud";
  else if (/fear|scar|shiver|tremb/.test(am)) expression = intensity === 2 || /shiver|shake|who is there/.test(t) ? "scared" : "worried";
  else if (/curious|wonder|bright/.test(am)) expression = "curious";
  else if (/warm|relief|kind|happy|proud/.test(am)) expression = /smile|danc|glow|together|hello/.test(t) ? "happy" : "neutral";
  else if (/sleepy/.test(mood)) expression = "sleepy";
  const emphasis = !!line.keyword && (!!line.focus || intensity === 2);
  return { agentId, intensity, pause, expression, emphasis, probabilities, latencyMs: 0, cacheHit: false, source: "mock" };
}

export function defaultDecision(): LineDecision {
  return { agentId: NARRATOR_AGENT, intensity: 1, pause: "short", expression: "neutral", emphasis: false, latencyMs: 0, cacheHit: false, source: "default" };
}

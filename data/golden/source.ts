// The golden story: hand-written bible, staging and decisions. `pnpm golden` adds draft-voice
// timings and writes data/golden/story.json, which the app bundles so it plays with the network off.
import type { LineDecision, SceneStaging, StoryBible } from "@/lib/schemas";

export const bible: StoryBible = {
  title: "Ember and the Dark",
  worldNote: "A grassy hill, a quiet forest and a cozy cave; gentle, warm, bedtime.",
  startLights: "day",
  characters: [
    {
      id: "ember", name: "Ember", rig: "biped",
      palette: { body: "white", accent: "orange", outline: "white" },
      features: { ears: "none", tail: "long", horns: true, wings: true, spikes: true, eyes: "round", accessory: "none" },
      scale: 1,
    },
    {
      id: "glim", name: "Glim", rig: "blob",
      palette: { body: "yellow", accent: "orange", outline: "white" },
      features: { ears: "none", tail: "none", horns: false, wings: true, spikes: false, eyes: "round", accessory: "none" },
      scale: 0.7,
    },
  ],
  agents: [
    {
      id: "hush", name: "Hush", mood: "calm, warm, near-whisper",
      routingHints: ["Calm scene-setting narration", "Gentle, slow, cozy moments", "The comforting ending"],
      voiceTraits: { age: "adult", gender: "male", quality: "warm storyteller" },
      tagPalette: [["softly"], ["warmly"], ["tenderly", "slowly"]],
      voiceSettings: { stability: 0.5, style: 0.3 }, ink: "white", wobble: 0.2,
    },
    {
      id: "wonder", name: "Wonder", mood: "curious, bright, delighted",
      routingHints: ["Questions and discoveries", "Excitement about something new", "Delight and joy"],
      voiceTraits: { age: "child", gender: "female", quality: "bright, playful" },
      tagPalette: [["curious"], ["excited"], ["delighted", "laughs"]],
      voiceSettings: { stability: 0.5, style: 0.6 }, ink: "yellow", wobble: 0.4,
    },
    {
      id: "shiver", name: "Shiver", mood: "nervous, trembling, small",
      routingHints: ["Fear of the dark", "Nervous questions", "Hiding and trembling"],
      voiceTraits: { age: "child", gender: "male", quality: "small, shaky" },
      tagPalette: [["nervous"], ["whispers", "nervous"], ["scared", "trembling"]],
      voiceSettings: { stability: 0, style: 0.7 }, ink: "blue", wobble: 1.2,
    },
    {
      id: "glow", name: "Glow", mood: "kind, reassuring, glowing",
      routingHints: ["A friend offering help", "Relief and bravery", "Warm reassurance"],
      voiceTraits: { age: "adult", gender: "female", quality: "kind, gentle" },
      tagPalette: [["kindly"], ["reassuring"], ["joyful", "warmly"]],
      voiceSettings: { stability: 0.5, style: 0.5 }, ink: "orange", wobble: 0.3,
    },
  ],
  scenes: [
    {
      id: 0, summary: "Ember the little dragon plays on a sunny hill, but worries about the night.", mood: "warm, then a little worried",
      lines: [
        { character: "narrator", text: "On a quiet hill, there lived a little dragon called Ember.", focus: "ember", keyword: "Ember" },
        { character: "ember", text: "Ember loved the sun, the warm grass, and the big blue sky." },
        { character: "narrator", text: "But every night, when the sun went down, Ember felt afraid.", focus: "sun", keyword: "down" },
        { character: "ember", text: "What if the dark is full of scary things?" },
      ],
    },
    {
      id: 1, summary: "Night falls in the forest. Ember hides, hears a rustle, and meets Glim the firefly.", mood: "scary, then surprised",
      lines: [
        { character: "narrator", text: "Then the lights went out, and the forest turned dark." },
        { character: "ember", text: "Who is there? I can hear something rustling!", focus: "bush", keyword: "rustling" },
        { character: "narrator", text: "A tiny light blinked on, then off, then on again." },
        { character: "glim", text: "Hello! I am Glim the firefly, and I glow!", focus: "glim", keyword: "glow" },
      ],
    },
    {
      id: 2, summary: "Glim shows Ember the stars in the meadow.", mood: "curious, delighted",
      lines: [
        { character: "narrator", text: "Glim floated close, and the dark did not feel so big." },
        { character: "glim", text: "Look up, Ember. The dark is where the stars come out to play." },
        { character: "ember", text: "Oh! They are sparkling, just like you!", focus: "star_a", keyword: "sparkling" },
        { character: "narrator", text: "One by one, Ember counted the stars, and smiled." },
      ],
    },
    {
      id: 3, summary: "Back in the cozy cave, Ember falls asleep while Glim glows nearby.", mood: "sleepy, safe, warm",
      lines: [
        { character: "narrator", text: "Back home in the cozy cave, Ember curled up in bed." },
        { character: "glim", text: "Goodnight, Ember. I will glow right here, by your side." },
        { character: "ember", text: "Goodnight, Glim. The dark is not so scary now." },
        { character: "narrator", text: "And the little dragon fell fast asleep, under a sky full of friends.", focus: "ember", keyword: "asleep" },
      ],
    },
  ],
};

export const staging: SceneStaging[] = [
  {
    sceneId: 0, backdrop: "hilltop",
    props: [
      { id: "sun", preset: "sun", at: [0.8, 0.14], size: 0.2, tappable: true, reaction: "glow" },
      { id: "cloud_a", preset: "cloud", at: [0.25, 0.12], size: 0.12, tappable: true, reaction: "wiggle" },
      { id: "flower_a", preset: "flower", at: [0.72, 0.86], size: 0.12, tappable: true, reaction: "pop" },
    ],
    actions: [
      { line: 0, at: 0, span: 1, action: { type: "enter", who: "ember", from: "left", to: [0.42, 0.8] } },
      { line: 1, at: 0.1, span: 0.7, action: { type: "gesture", who: "ember", kind: "jump" } },
      { line: 1, at: 0.6, span: 0.4, action: { type: "look_at", who: "ember", target: "sun" } },
      { line: 2, at: 0.3, span: 0.7, action: { type: "prop", id: "sun", do: "move", to: [0.86, 0.62] } },
      { line: 2, at: 0.6, span: 0.4, action: { type: "gesture", who: "ember", kind: "shiver" } },
      { line: 3, at: 0, span: 0.6, action: { type: "camera", focus: [0.42, 0.62], zoom: 1.3 } },
      { line: 3, at: 0.3, span: 0.7, action: { type: "gesture", who: "ember", kind: "hide" } },
    ],
  },
  {
    sceneId: 1, backdrop: "night_forest",
    props: [
      { id: "rock", preset: "rock", at: [0.72, 0.84], size: 0.16, tappable: true, reaction: "wiggle" },
      { id: "bush", preset: "bush", at: [0.18, 0.84], size: 0.18, tappable: true, reaction: "wiggle" },
      { id: "spark", preset: "star", at: [0.3, 0.4], size: 0.08, tappable: true, reaction: "glow" },
    ],
    actions: [
      { line: 0, at: 0.15, span: 0.4, action: { type: "lights", mode: "night" } },
      { line: 0, at: 0.2, span: 1, action: { type: "enter", who: "ember", from: "right", to: [0.6, 0.8] } },
      { line: 1, at: 0, span: 0.6, action: { type: "gesture", who: "ember", kind: "shiver" } },
      { line: 1, at: 0.2, span: 0.3, action: { type: "look_at", who: "ember", target: "bush" } },
      { line: 1, at: 0.5, span: 0.5, action: { type: "prop", id: "bush", do: "move", to: [0.2, 0.84] } },
      { line: 2, at: 0, span: 0.5, action: { type: "prop", id: "spark", do: "appear" } },
      { line: 2, at: 0.5, span: 0.5, action: { type: "prop", id: "spark", do: "disappear" } },
      { line: 3, at: 0, span: 0.8, action: { type: "enter", who: "glim", from: "left", to: [0.34, 0.8] } },
      { line: 3, at: 0.6, span: 0.4, action: { type: "gesture", who: "glim", kind: "wave" } },
    ],
  },
  {
    sceneId: 2, backdrop: "meadow",
    props: [
      { id: "star_a", preset: "star", at: [0.3, 0.12], size: 0.09, tappable: true, reaction: "glow" },
      { id: "star_b", preset: "star", at: [0.55, 0.06], size: 0.07, tappable: true, reaction: "glow" },
      { id: "star_c", preset: "star", at: [0.78, 0.16], size: 0.08, tappable: true, reaction: "glow" },
      { id: "moon", preset: "moon", at: [0.88, 0.1], size: 0.16, tappable: true, reaction: "pop" },
    ],
    actions: [
      { line: 0, at: 0, span: 0.8, action: { type: "enter", who: "ember", from: "left", to: [0.3, 0.8] } },
      { line: 0, at: 0.2, span: 0.8, action: { type: "enter", who: "glim", from: "right", to: [0.58, 0.8] } },
      { line: 1, at: 0, span: 0.4, action: { type: "prop", id: "star_a", do: "appear" } },
      { line: 1, at: 0.25, span: 0.4, action: { type: "prop", id: "star_b", do: "appear" } },
      { line: 1, at: 0.5, span: 0.4, action: { type: "prop", id: "star_c", do: "appear" } },
      { line: 1, at: 0.1, span: 0.5, action: { type: "gesture", who: "glim", kind: "point" } },
      { line: 2, at: 0, span: 0.6, action: { type: "gesture", who: "ember", kind: "jump" } },
      { line: 3, at: 0, span: 0.6, action: { type: "gesture", who: "ember", kind: "point" } },
      { line: 3, at: 0.4, span: 0.6, action: { type: "prop", id: "moon", do: "appear" } },
    ],
  },
  {
    sceneId: 3, backdrop: "cave",
    props: [
      { id: "bed", preset: "bed", at: [0.62, 0.86], size: 0.2, tappable: true, reaction: "wiggle" },
      { id: "lantern", preset: "lantern", at: [0.14, 0.7], size: 0.16, tappable: true, reaction: "glow" },
    ],
    actions: [
      { line: 0, at: 0, span: 1, action: { type: "enter", who: "ember", from: "right", to: [0.62, 0.8] } },
      { line: 1, at: 0, span: 0.8, action: { type: "enter", who: "glim", from: "left", to: [0.34, 0.8] } },
      { line: 1, at: 0.7, span: 0.3, action: { type: "gesture", who: "glim", kind: "wave" } },
      { line: 2, at: 0, span: 0.6, action: { type: "look_at", who: "ember", target: "glim" } },
      { line: 2, at: 0.4, span: 0.6, action: { type: "gesture", who: "ember", kind: "hug" } },
      { line: 3, at: 0, span: 0.7, action: { type: "camera", focus: [0.55, 0.65], zoom: 1.25 } },
      { line: 3, at: 0.2, span: 0.8, action: { type: "gesture", who: "ember", kind: "sleep" } },
    ],
  },
];

type D = [agent: string, intensity: 0 | 1 | 2, pause: LineDecision["pause"], expression: LineDecision["expression"], emphasis: boolean, latency: number];
const raw: D[][] = [
  [["hush", 0, "short", "happy", true, 14], ["wonder", 1, "short", "happy", false, 12], ["hush", 1, "short", "worried", true, 15], ["shiver", 1, "long", "worried", false, 13]],
  [["hush", 1, "long", "scared", false, 16], ["shiver", 2, "short", "scared", true, 12], ["hush", 1, "short", "curious", false, 14], ["glow", 1, "long", "happy", true, 13]],
  [["hush", 0, "short", "curious", false, 12], ["glow", 1, "short", "happy", false, 15], ["wonder", 2, "short", "happy", true, 11], ["hush", 1, "long", "proud", false, 14]],
  [["hush", 0, "short", "sleepy", false, 13], ["glow", 0, "short", "happy", false, 12], ["hush", 0, "short", "sleepy", false, 14], ["hush", 0, "long", "sleepy", true, 15]],
];

const ids = ["hush", "wonder", "shiver", "glow"];
export const decisions: LineDecision[][] = raw.map((scene) =>
  scene.map(([agentId, intensity, pause, expression, emphasis, latencyMs]) => {
    const rest = (1 - 0.82) / (ids.length - 1);
    const probabilities = Object.fromEntries(ids.map((id) => [id, id === agentId ? 0.82 : Math.round(rest * 100) / 100]));
    return { agentId, intensity, pause, expression, emphasis, probabilities, latencyMs, cacheHit: true, source: "jev" as const };
  }),
);

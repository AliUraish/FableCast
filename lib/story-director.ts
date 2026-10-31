// Story Director (readme 7.1): one Claude call per story -> a validated StoryBible.
// Length: MAX_STORY_SECONDS caps the whole video (speech + page titles/turns + THE END), turned into a word
// budget with WORDS_PER_SECOND; over budget -> one stricter retry, then trim lines from the middle scenes
// (never the first or the final comforting scene).
import { structured } from "./anthropic";
import { cached } from "./cache";
import { estimateSeconds } from "./draft-voice";
import { env, modes, storyCharBudget } from "./env";
import { claudeBudgetSpent } from "./limits";
import { mockBible } from "./mock";
import { errMsg } from "./resilience";
import { NARRATOR, StoryBible, type Tone } from "./schemas";
import { DEFAULT_TONE, samePerformance, TONES } from "./tones";

export const STORY_PROMPT_VERSION = "story-v5"; // v5: premise-specific, voices + speakers, natural pace

export function storyWords(b: StoryBible): number {
  return b.scenes.reduce((n, s) => n + s.lines.reduce((m, l) => m + l.text.split(/\s+/).filter(Boolean).length, 0), 0);
}

export function storySeconds(b: StoryBible, wps: number): number {
  const lines = b.scenes.reduce((n, s) => n + s.lines.length, 0);
  return estimateSeconds(storyWords(b), lines, b.scenes.length, wps);
}

// Matches engine/timeline.ts: PAGE_LEAD + SCENE_TAIL per page, END_HOLD after the last one.
const PAGE_OVERHEAD = 2.8;
const END_HOLD = 3.4;

/** Estimated length of the whole video: speech and pauses, page titles and turns, and THE END. */
export function videoSeconds(b: StoryBible, wps: number): number {
  return storySeconds(b, wps) + b.scenes.length * PAGE_OVERHEAD + END_HOLD;
}

/** Most spoken words that fit a video length (planned for 4 pages of 4 lines, with a 10% margin). */
export function wordsForVideo(seconds: number, wps: number, pages = 4, lines = 16): number {
  return Math.max(60, Math.floor((seconds - END_HOLD - pages * (PAGE_OVERHEAD + 0.6) - lines * 0.75) * wps * 0.9));
}

/** Characters reserved per line for the audio tags the composer adds (up to 2 tags + a pause tag). */
export const TAG_RESERVE = 30;

/** ElevenLabs characters a story will cost: its text plus the tag reserve for every line. */
export function storyChars(b: StoryBible): number {
  return b.scenes.reduce((n, s) => n + s.lines.reduce((m, l) => m + l.text.length + TAG_RESERVE, 0), 0);
}

/** Most spoken words that fit a character budget (about 6 characters per word with its space). */
export function wordsForChars(charBudget: number, lines = 16): number {
  return Math.max(60, Math.floor((charBudget - lines * TAG_RESERVE) / 6));
}

/**
 * Drop lines from the middle scenes (longest first, never below 2 lines) until the story fits both the
 * time ceiling and the per-story character budget (0 = no character budget); if that is not enough, drop
 * whole middle scenes (keeping at least 3), then middle lines of the first scene.
 * The final comforting scene is never touched.
 */
export function trimToBudget(b: StoryBible, maxSeconds: number, wps: number, maxChars = 0): { bible: StoryBible; trimmed: number } {
  const bible: StoryBible = JSON.parse(JSON.stringify(b));
  let trimmed = 0;
  while (videoSeconds(bible, wps) > maxSeconds || (maxChars > 0 && storyChars(bible) > maxChars)) {
    const middle = bible.scenes.slice(1, -1).filter((s) => s.lines.length > 2);
    if (middle.length) {
      const s = middle.sort((x, y) => y.lines.length - x.lines.length)[0];
      // Remove a line from the middle of the scene: keep its opening and closing beats.
      s.lines.splice(Math.floor(s.lines.length / 2), 1);
      trimmed++;
      continue;
    }
    if (bible.scenes.length > 3) {
      trimmed += bible.scenes[bible.scenes.length - 2].lines.length;
      bible.scenes.splice(bible.scenes.length - 2, 1);
      continue;
    }
    const first = bible.scenes[0];
    if (first.lines.length > 2) {
      first.lines.splice(Math.floor(first.lines.length / 2), 1);
      trimmed++;
      continue;
    }
    break;
  }
  if (trimmed) bible.scenes.forEach((s, i) => (s.id = i));
  return { bible, trimmed };
}

/** Semantic checks beyond the schema. Returns a problem description, or null when fine. */
export function checkBible(b: StoryBible): string | null {
  const problems: string[] = [];
  const inks = b.agents.map((a) => a.ink);
  if (new Set(inks).size !== inks.length) problems.push("Every mood agent must have a different ink token.");
  const aIds = b.agents.map((a) => a.id);
  if (new Set(aIds).size !== aIds.length) problems.push("Mood agent ids must be unique.");
  if (aIds.includes("narrator_default")) problems.push('Do not use the agent id "narrator_default".');
  const cIds = new Set(b.characters.map((c) => c.id));
  if (cIds.size !== b.characters.length) problems.push("Character ids must be unique.");
  b.scenes.forEach((s, si) => {
    s.lines.forEach((l, li) => {
      if (l.character !== NARRATOR && !cIds.has(l.character)) problems.push(`scenes[${si}].lines[${li}].character "${l.character}" is not a character id or "narrator".`);
      if (l.keyword && !l.text.toLowerCase().includes(l.keyword.toLowerCase())) problems.push(`scenes[${si}].lines[${li}].keyword "${l.keyword}" must be a word in its text.`);
    });
  });
  return problems.length ? problems.slice(0, 10).join("\n") : null;
}

function systemPrompt(maxWords: number, targetWords: number, strict: boolean, tone: Tone): string {
  const t = TONES[tone];
  return [
    "You are the Story Director for Fablecast, a bedtime storybook that draws itself while it is told.",
    "Write an ORIGINAL (or public-domain) gentle bedtime story for children aged 3-8, and cast it.",
    "",
    "LENGTH",
    `- Aim for about ${targetWords} spoken words in total and NEVER more than ${maxWords}.${strict ? " The previous draft was too long: cut hard." : ""}`,
    "- 3 to 6 scenes, each with 2 to 6 lines. One spoken clause per line: split long sentences at punctuation.",
    "",
    "MATCH THE PREMISE",
    "- Build the story from the family's premise: keep its characters, places, objects and problem, and add specific, vivid details",
    "  (names, colours, sounds, textures). Two different premises must give clearly different stories, settings and characters.",
    "- When the story travels, move between different places, so the pages look different. Set startLights from the premise (day or night).",
    "",
    `TONE: ${t.label}`,
    `- ${t.story}`,
    "",
    "PERFORMANCE (ElevenLabs v3 reads every line aloud and ACTS OUT audio tags in square brackets)",
    "- For EVERY line also write `performed`: the EXACT same words as `text`, in the same order, acted out with",
    "  1-3 audio tags placed where the feeling changes, at the start and/or mid-line. Example:",
    "  text: \"Who is there? Something is rustling!\"  performed: \"[whispers] Who is there? [gasps] Something is... [nervously] RUSTLING!\"",
    `- Prefer these tags for this tone: ${t.tags.map((x) => `[${x}]`).join(" ")}. Also fine: [laughs] [giggles] [sighs] [gasps] [whispers] [excited] [curious] [softly] [yawns].`,
    "- PACE each line to the moment, like a skilled reader: action, excitement and surprise are quick and lively (short sentences, ! and ?,",
    "  tags like [quickly] [excited] [rushed] [laughs]); only calm, tender or sleepy moments slow down ([slowly] [softly] [yawns]).",
    "  Never use pause tags. Use an ellipsis only for real suspense, at most one per page. Keep the story moving.",
    "- You may change punctuation for timing (, ! ?), use spaced dashes ( - ), and write at most ONE word per line in CAPITALS for emphasis.",
    "- Never add, drop or change a spoken word; tags hold only stage directions. Make character lines the most expressive and vary the tags so it sounds like a real performance, never flat.",
    "",
    "TONE AND SAFETY",
    "- Plain words, short clauses, tutor-like warmth (\"so\", \"now\", \"let's say\"). No word a young child has not met.",
    "- Gentle only: no violence, no peril beyond a mild bump in the night, and always a comforting, sleepy ending.",
    "",
    "VOICES (each voice is a real ElevenLabs actor)",
    "- narrator.gender: \"female\" or \"male\", whichever suits this story. Each character gets voice {gender, age} that fits it",
    "  (a girl owl -> female child, grandpa bear -> male elder, a mum fox -> female adult).",
    "- speaker on every line: the character id when that character SAYS the words out loud, otherwise \"narrator\".",
    "  Give the characters real dialogue: about half of the lines should be spoken by characters, in their own words.",
    "",
    "CHARACTERS (max 4)",
    "- Prefer animals and creatures; they read well as simple line drawings. Each uses rig \"biped\" or \"blob\" plus a skin.",
    "- ids are lowercase snake_case. palette values are ink tokens. Pick features that make each one recognisable.",
    "",
    "MOOD AGENTS (3 to 6): the troupe of performers who voice the story.",
    "- Each distinct (for example calm, curious, fearful, relieved), with 2-5 routingHints describing WHEN it should speak,",
    "  voiceTraits, a tagPalette of ElevenLabs v3 audio tags by intensity [calm, clear, peak] (e.g. [\"softly\"], [\"excited\"], [\"whispers\",\"scared\"]),",
    "  voiceSettings (stability exactly 0, 0.5 or 1), and a wobble (0 steady .. 1.5 trembling; scared moods wobble more).",
    "- ONE ink token per mood and never reuse a token for two moods (in mono mode each token is a distinct line style).",
    "",
    "LINES",
    "- character = the character id the line is about, or \"narrator\". The voice is chosen later, per line, by mood.",
    "- focus (optional) = id of a character, or a short prop name such as \"moon\", \"lantern\", \"bed\" the line draws attention to.",
    "- keyword (optional) = one word that appears in the line's text, where a hand-drawn highlight should land.",
    "",
    "VISUAL THINKING",
    "- Each scene needs at least two things worth drawing; key objects big and obvious. Every line should change something visible.",
    "- If the light changes (lights go out, the sun rises), say so plainly in a line. startLights is the light at the start.",
  ].join("\n");
}

async function fromClaude(premise: string, strict: boolean, tone: Tone) {
  const e = env();
  const budget = storyCharBudget(e);
  const byChars = budget ? wordsForChars(budget) : Infinity;
  const maxWords = Math.min(wordsForVideo(e.maxStorySeconds, e.wordsPerSecond), byChars);
  const targetWords = Math.min(wordsForVideo(e.targetSeconds, e.wordsPerSecond), Math.round(maxWords * 0.85));
  return structured({
    model: e.storyModel,
    system: systemPrompt(maxWords, targetWords, strict, tone),
    prompt: `Premise from the family: "${premise}"\n\nReturn the story bible.`,
    toolName: "story_bible",
    schema: StoryBible,
    maxTokens: 6000,
    timeoutMs: 75_000,
    check: checkBible,
  });
}

export interface DirectedStory {
  bible: StoryBible;
  source: "claude" | "mock" | "cache";
  tokens: number;
  warnings: string[];
}

/** Keep only performances that speak exactly the caption's words (anything else would desync captions). */
function cleanPerformances(b: StoryBible): { bible: StoryBible; dropped: number } {
  let dropped = 0;
  const bible: StoryBible = {
    ...b,
    scenes: b.scenes.map((sc) => ({
      ...sc,
      lines: sc.lines.map((l) => {
        if (l.performed === undefined || samePerformance(l.text, l.performed)) return l;
        dropped++;
        return { ...l, performed: undefined };
      }),
    })),
  };
  return { bible, dropped };
}

export async function directStory(premise: string, tone: Tone = DEFAULT_TONE): Promise<DirectedStory> {
  const e = env();
  const normalized = premise.trim().replace(/\s+/g, " ").toLowerCase();
  const warnings: string[] = [];
  const live = modes(e).claude === "live" && !claudeBudgetSpent();
  if (modes(e).claude === "live" && !live) warnings.push("CLAUDE_DAILY_CAP: using the built-in storyteller");

  const produce = async (): Promise<{ bible: StoryBible; source: "claude" | "mock"; tokens: number; warnings: string[] }> => {
    const w: string[] = [];
    if (!live) return { bible: mockBible(premise), source: "mock", tokens: 0, warnings: w };
    try {
      let r = await fromClaude(premise, false, tone);
      let tokens = r.tokens;
      const budget = storyCharBudget(e);
      if (videoSeconds(r.value, e.wordsPerSecond) > e.maxStorySeconds * 1.05 || (budget > 0 && storyChars(r.value) > budget * 1.1)) {
        w.push("OVER_BUDGET: retried with a stricter length");
        try {
          const r2 = await fromClaude(premise, true, tone);
          tokens += r2.tokens;
          r = r2;
        } catch (err) {
          w.push(`stricter retry failed: ${errMsg(err)}`);
        }
      }
      return { bible: r.value, source: "claude", tokens, warnings: w };
    } catch (err) {
      w.push(`Story Director failed (${errMsg(err).slice(0, 160)}); using the built-in storyteller`);
      return { bible: mockBible(premise), source: "mock", tokens: 0, warnings: w };
    }
  };

  const r = await cached("story", { premise: normalized, tone, model: live ? e.storyModel : "mock", v: STORY_PROMPT_VERSION }, produce, {
    // Do not pin a fallback story in the cache when Claude was supposed to answer.
    shouldCache: (v) => v.source === "claude" || !live,
  });
  warnings.push(...r.value.warnings);
  const budget = storyCharBudget(e);
  const trimmedStory = trimToBudget({ ...r.value.bible, tone }, e.maxStorySeconds, e.wordsPerSecond, budget);
  const trimmed = trimmedStory.trimmed;
  const { bible, dropped } = cleanPerformances(trimmedStory.bible);
  if (dropped) warnings.push(`${dropped} acted line(s) changed the words; those lines use mood tags instead`);
  if (trimmed) warnings.push(`TRIMMED ${trimmed} line(s) to fit a ${e.maxStorySeconds} s video${budget ? ` and ${budget} voice characters` : ""}`);
  return { bible, source: r.hit ? "cache" : r.value.source, tokens: r.hit ? 0 : r.value.tokens, warnings };
}

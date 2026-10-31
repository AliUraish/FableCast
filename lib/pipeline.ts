// Pipeline orchestration (readme 10), framework-agnostic: Convex actions (convex/pipeline.ts) and the API routes call it.
// runStory: Story Director -> casting. runScene: (Jev routing || Stage Director) -> composer -> ElevenLabs.
// In live voice mode every page is voiced by ElevenLabs or fails (and is retried); draft timing is dev/mock only.
// Session limits are applied by the route handlers, not here, so tests can call these directly.
import type { Metrics, SceneAudio, SceneRequest, SceneResult, StoryRequest, StoryResponse } from "./api-types";
import { cached, sha256, stableStringify } from "./cache";
import { castVoices, voiceFor } from "./casting";
import { compose, type Pause } from "./composer";
import { draftAudio } from "./draft-voice";
import { dialogueTake, singleVoiceTake, type TtsLine } from "./eleven";
import { env, modes } from "./env";
import { elevenBudgetSpent } from "./limits";
import { errMsg } from "./resilience";
import { routeScene } from "./router";
import { StoryBible, type LineDecision } from "./schemas";
import { DEFAULT_TONE } from "./tones";
import { stageScene } from "./stage-director";
import { directStory } from "./story-director";

export class InputError extends Error {}

const emptyMetrics = (): Metrics => ({ jevCalls: 0, jevMsTotal: 0, elevenChars: 0, claudeTokens: 0, cacheHits: 0, ms: 0 });

/** Normalise a premise: strip control characters, collapse whitespace, cap at 200 characters. */
export function cleanPremise(p: unknown): string {
  if (typeof p !== "string") throw new InputError("premise must be a string");
  // eslint-disable-next-line no-control-regex
  const s = p.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) throw new InputError("premise is empty");
  if (s.length > 200) throw new InputError("premise is longer than 200 characters");
  return s;
}

export function storyIdOf(bible: StoryBible): string {
  return sha256(stableStringify(bible)).slice(0, 16);
}

export async function runStory(req: StoryRequest): Promise<StoryResponse> {
  const t0 = Date.now();
  const e = env();
  const premise = cleanPremise(req.premise);
  const directed = await directStory(premise, req.tone ?? DEFAULT_TONE);
  const metrics = emptyMetrics();
  metrics.claudeTokens = directed.tokens;
  if (directed.source === "cache") metrics.cacheHits = 1;
  metrics.ms = Date.now() - t0;
  return {
    storyId: storyIdOf(directed.bible),
    bible: directed.bible,
    source: directed.source,
    casting: castVoices(directed.bible),
    metrics,
    warnings: directed.warnings,
    limits: { maxStorySeconds: e.maxStorySeconds, targetSeconds: e.targetSeconds, storiesLeft: e.maxStoriesPerSession },
  };
}

async function voiceScene(lines: TtsLine[], pauses: Pause[], warnings: string[], metrics: Metrics): Promise<SceneAudio> {
  const e = env();
  const draft = () => draftAudio(lines.map((l) => l.display), pauses, e.wordsPerSecond);
  if (modes(e).voice === "draft") return draft();
  const chars = lines.reduce((n, l) => n + l.performed.length, 0);
  const inputs = { model: "eleven_v3", lines: lines.map((l) => ({ t: l.performed, v: l.voiceId, s: l.stability })) };
  try {
    const r = await cached("tts", inputs, async () => {
      if (elevenBudgetSpent(chars)) throw new Error("ELEVEN_DAILY_CAP reached (set MAX_DAILY_ELEVEN_CHARS=0 for no cap)");
      try {
        return await dialogueTake(e.elevenKey, lines);
      } catch (err) {
        warnings.push(`dialogue failed (${errMsg(err).slice(0, 120)}); single-voice fallback`);
        return await singleVoiceTake(e.elevenKey, lines);
      }
    });
    if (r.hit) {
      metrics.cacheHits++;
      return { ...r.value, provider: "cache" };
    }
    metrics.elevenChars += chars;
    return r.value;
  } catch (err) {
    // No silent or browser-voice fallback in live mode: the page fails and is retried, still with ElevenLabs.
    throw new Error(`ElevenLabs could not voice this page: ${errMsg(err).slice(0, 200)}`);
  }
}

export async function runScene(req: SceneRequest): Promise<SceneResult> {
  const t0 = Date.now();
  const e = env();
  const parsed = StoryBible.safeParse(req.bible);
  if (!parsed.success) throw new InputError(`invalid bible: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const bible = parsed.data;
  const index = Number(req.index);
  if (!Number.isInteger(index) || index < 0 || index >= bible.scenes.length) throw new InputError("scene index out of range");
  const casting = req.casting && typeof req.casting === "object" && req.casting.narrator_default ? req.casting : castVoices(bible);
  const scene = bible.scenes[index];
  const warnings: string[] = [];
  const metrics = emptyMetrics();

  // Staging runs alongside routing AND voicing: the voice needs only the routing decisions, not the
  // sketches, so page 1 is ready as soon as the slower of (staging) and (routing -> ElevenLabs) finishes.
  const agents = new Map(bible.agents.map((a) => [a.id, a]));
  const routedP = routeScene(bible, index);
  const stagedP = stageScene(bible, index);
  const voicedP = routedP.then(async (routed) => {
    const lines: TtsLine[] = scene.lines.map((l, i) => {
      const d = routed.decisions[i];
      const c = compose(l.text, agents.get(d.agentId), d.intensity, d.pause, { performed: l.performed, tone: bible.tone, pauses: false });
      const v = voiceFor(casting, l, d.agentId, e.voiceMode);
      return { performed: c.performed, display: c.display, voiceId: v.voiceId, stability: c.settings.stability, style: c.settings.style };
    });
    return { lines, audio: await voiceScene(lines, routed.decisions.map((d) => d.pause), warnings, metrics) };
  });
  const [routed, staged, voiced] = await Promise.all([routedP, stagedP, voicedP]);
  warnings.push(...routed.warnings, ...staged.warnings);
  metrics.jevCalls = routed.jevCalls;
  metrics.jevMsTotal = routed.jevMsTotal;
  metrics.cacheHits += routed.cacheHits + (staged.source === "cache" ? 1 : 0);
  metrics.claudeTokens += routed.claudeTokens + staged.tokens;
  metrics.resolvedJevModel = routed.resolvedJevModel;

  // Claude picks each line's face so every story shows every expression; Jev still decides the performer,
  // intensity, pause and emphasis.
  const decisions: LineDecision[] = routed.decisions.map((d, i) => {
    const face = scene.lines[i]?.expression;
    return face ? { ...d, expression: face } : d;
  });
  const ttsLines = voiced.lines;
  const audio = voiced.audio;
  metrics.ms = Date.now() - t0;

  return {
    sceneId: scene.id,
    index,
    staging: staged.staging,
    stagingSource: staged.source,
    decisions,
    performed: ttsLines.map((l) => l.performed),
    audio,
    metrics,
    warnings,
  };
}

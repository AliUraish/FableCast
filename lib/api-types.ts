// Wire contracts between the browser and the Next.js API routes.
// The routes are stateless: the client sends the bible back with every scene request,
// so any server instance can serve any scene (the content-addressed cache makes repeats free).
import type { LineDecision, SceneStaging, StoryBible, Tone } from "./schemas";

export interface WordTime {
  text: string; // display word (tags stripped)
  start: number; // seconds
  end: number;
}

export interface Casting {
  // agentId -> pool voice. Always contains "narrator_default".
  [agentId: string]: { voiceId: string; name: string; slot: string };
}

export interface Metrics {
  jevCalls: number;
  jevMsTotal: number;
  elevenChars: number;
  claudeTokens: number;
  cacheHits: number;
  resolvedJevModel?: string;
  ms: number;
}

export type Source = "claude" | "mock" | "default" | "cache";

export interface StoryRequest {
  premise: string;
  theme: "night" | "day";
  tone?: Tone; // default "cozy"
}

export interface StoryResponse {
  storyId: string; // sha of the bible
  bible: StoryBible;
  source: Source;
  casting: Casting;
  metrics: Metrics;
  warnings: string[];
  limits: { maxStorySeconds: number; targetSeconds: number; storiesLeft: number };
}

export interface SceneRequest {
  bible: StoryBible;
  index: number; // scene index in bible.scenes
  casting: Casting;
}

export interface SceneAudio {
  provider: "eleven" | "eleven_single" | "draft" | "cache";
  src: string | null; // data:audio/mpeg;base64,... ; null = silent draft (clock runs on wall time)
  duration: number; // seconds of the whole scene take
  // One entry per scene line, scene-relative seconds. Words exclude [tags].
  lines: { start: number; end: number; words: WordTime[] }[];
}

export interface SceneResult {
  sceneId: number;
  index: number;
  staging: SceneStaging;
  stagingSource: Source;
  decisions: LineDecision[]; // one per line
  performed: string[]; // text sent to TTS, with audio tags
  audio: SceneAudio;
  metrics: Metrics;
  warnings: string[];
}

export interface ApiError {
  error: string;
  code?: "LIMIT" | "BAD_INPUT" | "INTERNAL";
}

export interface HealthResponse {
  providers: { name: string; ok: boolean; detail: string }[];
  config: Record<string, string | number | boolean>;
}

// A fully prepared story (golden story file format, and what the player holds in memory).
export interface PreparedStory {
  storyId: string;
  bible: StoryBible;
  casting: Casting;
  scenes: (SceneResult | null)[]; // null = not ready yet
}

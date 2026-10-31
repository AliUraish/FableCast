// Typed, server-side env reader. Values may carry inline `# comments` (see .env), so strip them.
// (No "server-only" import: tsx tests import these modules directly.)

function raw(key: string): string {
  const v = process.env[key];
  if (v === undefined) return "";
  return v.split(/\s+#/)[0].replace(/^#.*/, "").trim();
}

function str(key: string, d: string): string {
  return raw(key) || d;
}

function num(key: string, d: number): number {
  const n = Number(raw(key));
  return raw(key) !== "" && Number.isFinite(n) ? n : d;
}

function flag(key: string): boolean {
  return ["1", "true", "yes", "on"].includes(raw(key).toLowerCase());
}

/** Jev is called directly on TypeSafe's API, so gateway-style ids are mapped to a pinned direct id. */
function jevModel(): string {
  const m = raw("JEV_MODEL");
  if (!m) return "jev-1.14.0";
  if (m.startsWith("typesafe-ai/")) {
    const rest = m.slice("typesafe-ai/".length);
    return rest === "jev" || rest === "" ? "jev-1.14.0" : rest;
  }
  return m;
}

export function env() {
  const maxStory = num("MAX_STORY_SECONDS", 120);
  return {
    anthropicKey: raw("ANTHROPIC_API_KEY"),
    jevKey: raw("JEV_API_KEY"),
    elevenKey: raw("ELEVENLABS_API_KEY"),
    storyModel: str("STORY_MODEL", "claude-sonnet-5-5"),
    stagingModel: str("STAGING_MODEL", "claude-sonnet-5-5"),
    jevModel: jevModel(),
    agentFloor: num("AGENT_FLOOR", 0.4),
    voiceProvider: (str("VOICE_PROVIDER", "eleven") === "draft" ? "draft" : "eleven") as "draft" | "eleven",
    voiceMode: (["ensemble", "locked"].includes(str("VOICE_MODE", "cast")) ? str("VOICE_MODE", "cast") : "cast") as "cast" | "ensemble" | "locked",
    wordsPerSecond: num("WORDS_PER_SECOND", 2.5),
    cacheVersion: str("CACHE_VERSION", "1"),
    inkMode: str("INK_MODE", "mono"),
    maxStorySeconds: maxStory,
    targetSeconds: Math.min(num("TARGET_SECONDS", 90), maxStory),
    maxGenerationSeconds: num("MAX_GENERATION_SECONDS", 45),
    maxSessionMinutes: num("MAX_SESSION_MINUTES", 30),
    maxStoriesPerSession: num("MAX_STORIES_PER_SESSION", 5),
    maxDailyClaudeTokens: num("MAX_DAILY_CLAUDE_TOKENS", 500000),
    maxDailyElevenChars: num("MAX_DAILY_ELEVEN_CHARS", 10000),
    // Narrator voice: a pool name ("lily", "brian", "george") or an ElevenLabs voice id. Empty = George.
    narratorVoice: str("NARRATOR_VOICE", ""),
    // Fully voiced stories per day; each story is sized to MAX_DAILY_ELEVEN_CHARS / DAILY_STORY_RUNS.
    dailyStoryRuns: num("DAILY_STORY_RUNS", 6),
    mockClaude: flag("MOCK_CLAUDE"),
    mockJev: flag("MOCK_JEV"),
    mockAudio: flag("MOCK_AUDIO"),
  };
}

export type Env = ReturnType<typeof env>;

/** ElevenLabs characters one story may use (text + audio tags); 0 = no per-story budget. */
export function storyCharBudget(e: Env = env()): number {
  return e.maxDailyElevenChars > 0 && e.dailyStoryRuns > 0 ? Math.floor(e.maxDailyElevenChars / e.dailyStoryRuns) : 0;
}

/** Which path each provider will take right now (no network). */
export function modes(e: Env = env()) {
  return {
    claude: e.mockClaude || !e.anthropicKey ? "mock" : "live",
    jev: e.mockJev || !e.jevKey ? "mock" : "live",
    voice: e.voiceProvider === "draft" || e.mockAudio || !e.elevenKey ? "draft" : "live",
  } as const;
}

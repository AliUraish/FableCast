"use node";
// The streaming pipeline as Convex actions (readme 10). The work itself is lib/pipeline.ts, unchanged;
// these actions add durable storage, the durable cache, spend caps across instances, and retries.
import { v } from "convex/values";
import type { HealthResponse, SceneResult, StoryResponse } from "../lib/api-types";
import { cacheBackend, type CacheBackend } from "../lib/cache";
import { env, modes, storyCharBudget } from "../lib/env";
import { addClaudeTokens, addElevenChars, syncDaily } from "../lib/limits";
import { runScene, runStory } from "../lib/pipeline";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";

const BIG = 200_000;

function backendFor(ctx: ActionCtx): CacheBackend {
  return {
    async get(key) {
      const row = await ctx.runQuery(internal.cache.get, { key });
      if (!row) return undefined;
      await ctx.runMutation(internal.cache.hit, { id: row._id });
      if (row.payload !== undefined) return JSON.parse(row.payload);
      if (row.storageId) {
        const blob = await ctx.storage.get(row.storageId);
        return blob ? JSON.parse(await blob.text()) : undefined;
      }
      return undefined;
    },
    async put(key, kind, value) {
      const s = JSON.stringify(value);
      if (s.length > BIG) {
        const storageId = await ctx.storage.store(new Blob([s], { type: "application/json" }));
        await ctx.runMutation(internal.cache.put, { key, kind, storageId, bytes: s.length });
      } else {
        await ctx.runMutation(internal.cache.put, { key, kind, payload: s, bytes: s.length });
      }
    },
  };
}

async function withDurable<T>(ctx: ActionCtx, fn: () => Promise<T>): Promise<T> {
  const u = await ctx.runQuery(internal.stories.usageToday, { day: new Date().toISOString().slice(0, 10) });
  syncDaily(u.claudeTokens, u.elevenChars);
  return cacheBackend.run(backendFor(ctx), fn);
}

export const generateStory = internalAction({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.runQuery(internal.stories.load, { storyId });
    if (!story || story.status !== "writing") return;
    const t0 = Date.now();
    try {
      const response: StoryResponse = await withDurable(ctx, () => runStory({ premise: story.premise, theme: story.theme, tone: story.tone }));
      addClaudeTokens(response.metrics.claudeTokens);
      await ctx.runMutation(internal.stories.addUsage, { claudeTokens: response.metrics.claudeTokens, elevenChars: 0, stories: 0 }); // the run was counted by stories.create
      await ctx.runMutation(internal.stories.setStory, { storyId, response });
      await ctx.runMutation(internal.stories.logEvent, { storyId, stage: `story:${response.source}`, ok: true, ms: Date.now() - t0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.stories.failStory, { storyId, error: msg });
      await ctx.runMutation(internal.stories.logEvent, { storyId, stage: "story", ok: false, ms: Date.now() - t0, error: msg.slice(0, 300) });
    }
  },
});

export const processScene = internalAction({
  args: { sceneId: v.id("scenes") },
  handler: async (ctx, { sceneId }) => {
    const attempt = await ctx.runMutation(internal.stories.startScene, { sceneId });
    if (attempt === null) return;
    const loaded = await ctx.runQuery(internal.stories.loadScene, { sceneId });
    if (!loaded || !loaded.story.response) return;
    const { scene, story } = loaded;
    const resp = story.response as StoryResponse;
    const t0 = Date.now();
    try {
      const result: SceneResult = await withDurable(ctx, () => runScene({ bible: resp.bible, index: scene.index, casting: resp.casting }));
      // Audio goes to file storage; the row keeps only timings. The query hands back a storage URL.
      let audioStorageId;
      const src = result.audio.src;
      if (src && src.startsWith("data:")) {
        const [head, b64] = src.split(",", 2);
        const type = head.slice(5).split(";")[0] || "audio/mpeg";
        audioStorageId = await ctx.storage.store(new Blob([Buffer.from(b64, "base64")], { type }));
      }
      const stored: SceneResult = { ...result, audio: { ...result.audio, src: null } };
      addElevenChars(result.metrics.elevenChars);
      await ctx.runMutation(internal.stories.addUsage, { claudeTokens: result.metrics.claudeTokens, elevenChars: result.metrics.elevenChars, stories: 0 });
      await ctx.runMutation(internal.stories.setScene, { sceneId, result: stored, audioStorageId });
      await ctx.runMutation(internal.stories.logEvent, { storyId: story._id, stage: `scene${scene.index}:${result.audio.provider}`, ok: true, ms: Date.now() - t0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.stories.failScene, { sceneId, error: msg, retry: attempt < 4 });
      await ctx.runMutation(internal.stories.logEvent, { storyId: story._id, stage: `scene${scene.index}`, ok: false, ms: Date.now() - t0, error: msg.slice(0, 300) });
    }
  },
});

/** Provider status for /health: which keys are set and which path each provider takes. No network calls. */
export const health = action({
  args: {},
  handler: async (ctx): Promise<HealthResponse> => {
    const e = env();
    const m = modes(e);
    const u = await ctx.runQuery(internal.stories.usageToday, { day: new Date().toISOString().slice(0, 10) });
    const c = await ctx.runQuery(internal.cache.stats, {});
    const line = (name: string, key: string, mode: string) => ({
      name, ok: !!key, detail: `${key ? "KEY SET" : "NO KEY"} · MODE ${mode.toUpperCase()}`,
    });
    return {
      providers: [
        { name: "CONVEX", ok: true, detail: "BACKEND OK" },
        line("CLAUDE", e.anthropicKey, m.claude),
        line("JEV", e.jevKey, m.jev),
        line("ELEVENLABS", e.elevenKey, m.voice),
        { name: "CACHE", ok: true, detail: `${c.entries} ENTRIES · ${c.hits} HITS · CONVEX` },
      ],
      config: {
        backend: "convex",
        storyModel: e.storyModel, stagingModel: e.stagingModel, jevModel: e.jevModel,
        voiceProvider: e.voiceProvider, voiceMode: e.voiceMode, maxStorySeconds: e.maxStorySeconds,
        maxStoriesPerSession: e.maxStoriesPerSession, maxDailyClaudeTokens: e.maxDailyClaudeTokens,
        maxDailyElevenChars: e.maxDailyElevenChars, dailyStoryRuns: e.dailyStoryRuns, storyCharBudget: storyCharBudget(e), claudeTokensToday: u.claudeTokens, elevenCharsToday: u.elevenChars,
        mockClaude: e.mockClaude, mockJev: e.mockJev, mockAudio: e.mockAudio,
      },
    };
  },
});

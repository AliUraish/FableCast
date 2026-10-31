// Story jobs: the browser creates a story, the pipeline actions fill it in, and the player
// subscribes with useQuery(api.stories.get) so page 1 plays while later pages are still being prepared.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

const num = (k: string, d: number) => {
  const raw = (process.env[k] ?? "").split("#")[0].trim();
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : d;
};
const today = () => new Date().toISOString().slice(0, 10);

export const create = mutation({
  args: {
    premise: v.string(),
    theme: v.union(v.literal("night"), v.literal("day")),
    tone: v.optional(v.union(v.literal("cozy"), v.literal("silly"), v.literal("adventure"), v.literal("spooky"), v.literal("dreamy"))),
    sessionId: v.string(),
  },
  handler: async (ctx, { premise, theme, tone, sessionId }) => {
    // eslint-disable-next-line no-control-regex
    const clean = premise.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) throw new ConvexError({ code: "BAD_INPUT", message: "Tell me what the story is about." });
    if (clean.length > 200) throw new ConvexError({ code: "BAD_INPUT", message: "That premise is longer than 200 characters." });
    const sid = sessionId.slice(0, 64) || "anon";
    const max = num("MAX_STORIES_PER_SESSION", 5);
    const since = Date.now() - num("MAX_SESSION_MINUTES", 30) * 60_000;
    const recent = await ctx.db
      .query("stories")
      .withIndex("by_session", (q) => q.eq("sessionId", sid).gt("createdAt", since))
      .take(max + 1);
    if (recent.length >= max) {
      throw new ConvexError({ code: "LIMIT", message: "That's all the new stories for this browser for now. Try a ready story." });
    }
    // Daily runs (all users): counted here, in the same transaction, so two taps can never both take the last one.
    const runs = num("DAILY_STORY_RUNS", 6);
    const day = today();
    const usage = await ctx.db.query("usage").withIndex("by_day", (q) => q.eq("day", day)).unique();
    const used = usage?.stories ?? 0;
    if (runs > 0 && used >= runs) {
      throw new ConvexError({ code: "LIMIT", message: `That's all ${runs} stories for tonight. Try a ready story.` });
    }
    if (usage) await ctx.db.patch(usage._id, { stories: used + 1 });
    else await ctx.db.insert("usage", { day, claudeTokens: 0, elevenChars: 0, stories: 1 });
    const storyId = await ctx.db.insert("stories", { premise: clean, theme, tone, sessionId: sid, status: "writing", createdAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.pipeline.generateStory, { storyId });
    return { storyId, storiesLeft: runs > 0 ? runs - used - 1 : Math.max(0, max - recent.length - 1) };
  },
});

/** Stories left today for everyone (the Home hint). `day` is passed in: queries must not read the clock. */
export const tonight = query({
  args: { day: v.string() },
  handler: async (ctx, { day }) => {
    const runs = num("DAILY_STORY_RUNS", 6);
    const usage = await ctx.db.query("usage").withIndex("by_day", (q) => q.eq("day", day)).unique();
    const used = usage?.stories ?? 0;
    return { runs, used, left: runs > 0 ? Math.max(0, runs - used) : null };
  },
});

/** Everything the player needs, with each scene's audio as a storage URL. */
export const get = query({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => {
    const story = await ctx.db.get(storyId);
    if (!story) return null;
    const rows = await ctx.db.query("scenes").withIndex("by_story", (q) => q.eq("storyId", storyId)).take(10);
    const scenes = await Promise.all(
      rows.map(async (r) => {
        let result = r.result ?? null;
        if (result && r.audioStorageId) {
          const url = await ctx.storage.getUrl(r.audioStorageId);
          result = { ...result, audio: { ...result.audio, src: url } };
        }
        return { index: r.index, status: r.status, error: r.error ?? null, result };
      }),
    );
    scenes.sort((a, b) => a.index - b.index);
    return { status: story.status, error: story.error ?? null, response: story.response ?? null, scenes };
  },
});

// ---------- internal: used by the pipeline actions ----------

export const load = internalQuery({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => ctx.db.get(storyId),
});

export const loadScene = internalQuery({
  args: { sceneId: v.id("scenes") },
  handler: async (ctx, { sceneId }) => {
    const scene = await ctx.db.get(sceneId);
    if (!scene) return null;
    const story = await ctx.db.get(scene.storyId);
    return story ? { scene, story } : null;
  },
});

/** Store the bible, create one row per scene and fan out: scene 0 first, the rest right behind it. */
export const setStory = internalMutation({
  args: { storyId: v.id("stories"), response: v.any() },
  handler: async (ctx, { storyId, response }) => {
    await ctx.db.patch(storyId, { status: "ready", response });
    const n: number = response.bible.scenes.length;
    for (let i = 0; i < n; i++) {
      const sceneId = await ctx.db.insert("scenes", { storyId, index: i, status: "queued", attempts: 0 });
      await ctx.scheduler.runAfter(i === 0 ? 0 : 250, internal.pipeline.processScene, { sceneId });
    }
  },
});

export const failStory = internalMutation({
  args: { storyId: v.id("stories"), error: v.string() },
  handler: async (ctx, { storyId, error }) => {
    await ctx.db.patch(storyId, { status: "failed", error: error.slice(0, 300) });
  },
});

export const startScene = internalMutation({
  args: { sceneId: v.id("scenes") },
  handler: async (ctx, { sceneId }) => {
    const s = await ctx.db.get(sceneId);
    if (!s || s.status === "ready") return null; // idempotent: finished work is skipped
    await ctx.db.patch(sceneId, { status: "voicing", attempts: s.attempts + 1 });
    return s.attempts + 1;
  },
});

export const setScene = internalMutation({
  args: { sceneId: v.id("scenes"), result: v.any(), audioStorageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { sceneId, result, audioStorageId }) => {
    await ctx.db.patch(sceneId, { status: "ready", result, audioStorageId, error: undefined });
  },
});

export const failScene = internalMutation({
  args: { sceneId: v.id("scenes"), error: v.string(), retry: v.boolean() },
  handler: async (ctx, { sceneId, error, retry }) => {
    await ctx.db.patch(sceneId, { status: retry ? "queued" : "failed", error: error.slice(0, 300) });
    if (retry) await ctx.scheduler.runAfter(1000, internal.pipeline.processScene, { sceneId });
  },
});

// ---------- durable daily usage (spend caps across every server instance) ----------

export const usageToday = internalQuery({
  args: { day: v.string() }, // passed in: queries must not read the clock
  handler: async (ctx, { day }) => {
    const row = await ctx.db.query("usage").withIndex("by_day", (q) => q.eq("day", day)).unique();
    return { claudeTokens: row?.claudeTokens ?? 0, elevenChars: row?.elevenChars ?? 0 };
  },
});

export const addUsage = internalMutation({
  args: { claudeTokens: v.number(), elevenChars: v.number(), stories: v.number() },
  handler: async (ctx, a) => {
    const day = today();
    const row = await ctx.db.query("usage").withIndex("by_day", (q) => q.eq("day", day)).unique();
    if (row) {
      await ctx.db.patch(row._id, {
        claudeTokens: row.claudeTokens + a.claudeTokens,
        elevenChars: row.elevenChars + a.elevenChars,
        stories: row.stories + a.stories,
      });
    } else await ctx.db.insert("usage", { day, ...a });
  },
});

export const logEvent = internalMutation({
  args: { storyId: v.optional(v.id("stories")), stage: v.string(), ok: v.boolean(), ms: v.number(), error: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await ctx.db.insert("events", a);
  },
});

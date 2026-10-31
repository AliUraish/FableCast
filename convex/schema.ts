// Convex data model (readme 10). Large values (scene audio, big cache payloads) live in file storage.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  stories: defineTable({
    premise: v.string(),
    theme: v.union(v.literal("night"), v.literal("day")),
    tone: v.optional(v.union(v.literal("cozy"), v.literal("silly"), v.literal("adventure"), v.literal("spooky"), v.literal("dreamy"))),
    sessionId: v.string(),
    status: v.union(v.literal("writing"), v.literal("ready"), v.literal("failed")),
    response: v.optional(v.any()), // StoryResponse (bible, casting, metrics, warnings)
    error: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "createdAt"]),

  scenes: defineTable({
    storyId: v.id("stories"),
    index: v.number(),
    status: v.union(v.literal("queued"), v.literal("voicing"), v.literal("ready"), v.literal("failed")),
    attempts: v.number(),
    result: v.optional(v.any()), // SceneResult with audio.src = null (the audio is in storage)
    audioStorageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
  }).index("by_story", ["storyId", "index"]),

  cache: defineTable({
    key: v.string(),
    kind: v.string(),
    payload: v.optional(v.string()), // JSON, when small
    storageId: v.optional(v.id("_storage")), // JSON blob, when large
    bytes: v.number(),
    hits: v.number(),
    lastHitAt: v.number(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  usage: defineTable({
    day: v.string(), // YYYY-MM-DD (UTC)
    claudeTokens: v.number(),
    elevenChars: v.number(),
    stories: v.number(),
  }).index("by_day", ["day"]),

  events: defineTable({
    storyId: v.optional(v.id("stories")),
    stage: v.string(),
    ok: v.boolean(),
    ms: v.number(),
    error: v.optional(v.string()),
  }),
});

// Durable content-addressed cache rows (readme 11.1). Payloads over ~200 KB go to file storage.
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const get = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => ctx.db.query("cache").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

export const hit = internalMutation({
  args: { id: v.id("cache") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row) await ctx.db.patch(id, { hits: row.hits + 1, lastHitAt: Date.now() });
  },
});

export const put = internalMutation({
  args: { key: v.string(), kind: v.string(), payload: v.optional(v.string()), storageId: v.optional(v.id("_storage")), bytes: v.number() },
  handler: async (ctx, a) => {
    const old = await ctx.db.query("cache").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    if (old) return; // first writer wins; identical inputs give identical values
    const now = Date.now();
    await ctx.db.insert("cache", { ...a, hits: 0, lastHitAt: now, createdAt: now });
  },
});

export const stats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("cache").take(1000);
    return { entries: rows.length, hits: rows.reduce((s, r) => s + r.hits, 0) };
  },
});

// Content-addressed cache for every stage (readme 11.1): sha256(CACHE_VERSION + kind + stableStringify(inputs)).
// In memory (with single-flight), plus a durable backend when one is bound for the current call
// (the Convex `cache` table, see convex/pipeline.ts), plus a JSON file cache under .cache/ for local dev.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";

export type Kind = "story" | "staging" | "jev" | "tts" | "tag";

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hashKey(kind: Kind, inputs: unknown): string {
  return sha256(`${env().cacheVersion}|${kind}|${stableStringify(inputs)}`);
}

const mem = new Map<string, { value: unknown; hits: number; createdAt: number }>();
const inflight = new Map<string, Promise<{ value: unknown; hit: boolean }>>();
let hitCount = 0;

const useFiles = !process.env.VERCEL && !process.env.CONVEX_CLOUD_URL;
const DIR = path.join(process.cwd(), ".cache");

export interface CacheBackend {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, kind: Kind, value: unknown): Promise<void>;
}
/** Per-call durable backend (AsyncLocalStorage, so concurrent actions never share one). */
export const cacheBackend = new AsyncLocalStorage<CacheBackend>();

async function fileGet(key: string): Promise<unknown | undefined> {
  if (!useFiles) return undefined;
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${key}.json`), "utf8"));
  } catch {
    return undefined;
  }
}

async function filePut(key: string, value: unknown) {
  if (!useFiles) return;
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${key}.json`), JSON.stringify(value));
  } catch {
    /* a read-only filesystem just means memory-only caching */
  }
}

export async function getCache<T>(key: string): Promise<T | undefined> {
  const m = mem.get(key);
  if (m) {
    m.hits += 1;
    hitCount += 1;
    return m.value as T;
  }
  const b = cacheBackend.getStore();
  const f = b ? await b.get(key).catch(() => undefined) : await fileGet(key);
  if (f !== undefined) {
    mem.set(key, { value: f, hits: 1, createdAt: Date.now() });
    hitCount += 1;
    return f as T;
  }
  return undefined;
}

export async function putCache(key: string, value: unknown, kind: Kind = "story") {
  mem.set(key, { value, hits: 0, createdAt: Date.now() });
  // Keep memory bounded on long-lived instances.
  if (mem.size > 2000) {
    const oldest = mem.keys().next().value;
    if (oldest) mem.delete(oldest);
  }
  const b = cacheBackend.getStore();
  if (b) await b.put(key, kind, value).catch(() => undefined);
  else await filePut(key, value);
}

/** Identical concurrent requests share one produce() call. Values that should not be cached can return { noCache }. */
export async function cached<T>(
  kind: Kind,
  inputs: unknown,
  produce: () => Promise<T>,
  opts: { shouldCache?: (v: T) => boolean } = {},
): Promise<{ value: T; hit: boolean; key: string }> {
  const key = hashKey(kind, inputs);
  const hit = await getCache<T>(key);
  if (hit !== undefined) return { value: hit, hit: true, key };
  const running = inflight.get(key);
  if (running) {
    const r = await running;
    return { value: r.value as T, hit: r.hit, key };
  }
  const p = (async () => {
    const value = await produce();
    if (!opts.shouldCache || opts.shouldCache(value)) await putCache(key, value, kind);
    return { value: value as unknown, hit: false };
  })();
  inflight.set(key, p);
  try {
    const r = await p;
    return { value: r.value as T, hit: false, key };
  } finally {
    inflight.delete(key);
  }
}

export function cacheStats() {
  return { entries: mem.size, hits: hitCount, files: useFiles };
}

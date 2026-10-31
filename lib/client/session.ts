// Per-browser-session bookkeeping (sessionStorage). The server enforces the real limits.
"use client";
import type { Tone } from "@/lib/schemas";
import { DEFAULT_TONE, TONE_IDS } from "@/lib/tones";

export const MAX_STORY_SECONDS = Number(process.env.NEXT_PUBLIC_MAX_STORY_SECONDS ?? 120) || 120;
export const MAX_STORIES = Number(process.env.NEXT_PUBLIC_MAX_STORIES_PER_SESSION ?? 5) || 5;
export const MAX_GENERATION_SECONDS = Number(process.env.NEXT_PUBLIC_MAX_GENERATION_SECONDS ?? 45) || 45;
export const INK_MODE = (process.env.NEXT_PUBLIC_INK_MODE === "chalk" ? "chalk" : "mono") as "mono" | "chalk";

const COUNT = "fablecast:count";

export interface StoredRequest {
  premise: string;
  theme: "night" | "day";
  tone?: Tone;
}

const TONE_KEY = "fablecast:tone";
/** The tone chosen on Home, remembered per browser. */
export function loadTone(): Tone {
  try {
    const t = window.localStorage.getItem(TONE_KEY);
    return (TONE_IDS as string[]).includes(t ?? "") ? (t as Tone) : DEFAULT_TONE;
  } catch {
    return DEFAULT_TONE;
  }
}
export function saveTone(t: Tone): void {
  try {
    window.localStorage.setItem(TONE_KEY, t);
  } catch {}
}

function ss(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function storiesUsed(): number {
  return Number(ss()?.getItem(COUNT) ?? 0) || 0;
}

export function storiesLeft(): number {
  return Math.max(0, MAX_STORIES - storiesUsed());
}

export function countStory(): void {
  ss()?.setItem(COUNT, String(storiesUsed() + 1));
}

/** Stable per-browser id for the server-side session limits (localStorage; falls back to per-tab). */
export function browserSessionId(): string {
  const KEY = "fablecast:sid";
  try {
    const have = window.localStorage.getItem(KEY);
    if (have) return have;
    const id = newStoryId() + newStoryId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "anon-" + newStoryId();
  }
}

export function newStoryId(): string {
  const c = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return c.replace(/-/g, "").slice(0, 10);
}

export function saveRequest(id: string, req: StoredRequest): void {
  ss()?.setItem(`fablecast:req:${id}`, JSON.stringify(req));
}

export function loadRequest(id: string): StoredRequest | null {
  try {
    const raw = ss()?.getItem(`fablecast:req:${id}`);
    return raw ? (JSON.parse(raw) as StoredRequest) : null;
  } catch {
    return null;
  }
}

export function saveJSON(key: string, v: unknown): void {
  try {
    ss()?.setItem(key, JSON.stringify(v));
  } catch {}
}

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = ss()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

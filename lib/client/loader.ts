// Client side of the streaming pipeline. Two paths, chosen once at module load:
// - Convex (NEXT_PUBLIC_CONVEX_URL set): one mutation creates the story job, then a live
//   useQuery subscription delivers the bible and each page as the Convex actions finish them.
// - API routes (fallback): POST /api/story, then POST /api/scene per scene (scene 0 first, max 3 in flight).
// Either way the player starts as soon as page 1 is ready; later pages fill in while it plays.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CONVEX_URL } from "@/components/ConvexClientProvider";
import type {
  ApiError, PreparedStory, SceneRequest, SceneResult, StoryRequest, StoryResponse,
} from "@/lib/api-types";
import { MAX_GENERATION_SECONDS, browserSessionId, countStory, loadJSON, loadRequest, saveJSON } from "./session";

export type StepState = "pending" | "ok" | "fail";
export interface StatusLine {
  key: string;
  label: string;
  state: StepState;
}

export interface StoryLoad {
  prepared: PreparedStory | null;
  status: StatusLine[];
  error: string | null;
  elapsed: number; // seconds waited for page 1
  timedOut: boolean;
  source: string | null;
  storyWarnings: string[];
  storyMetrics: StoryResponse["metrics"] | null;
}

const MAX_IN_FLIGHT = 3;

async function postJSON<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T | ApiError;
  if (!res.ok) {
    const e = data as ApiError;
    const err = new Error(e.error || `HTTP ${res.status}`) as Error & { code?: string };
    err.code = e.code;
    throw err;
  }
  return data as T;
}

function isPrepared(x: unknown): x is PreparedStory {
  const p = x as PreparedStory;
  return !!p && typeof p === "object" && !!p.bible && Array.isArray(p.scenes);
}

function useStoryApi(id: string): StoryLoad {
  const [prepared, setPrepared] = useState<PreparedStory | null>(null);
  const [status, setStatus] = useState<StatusLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [source, setSource] = useState<string | null>(null);
  const [storyWarnings, setStoryWarnings] = useState<string[]>([]);
  const [storyMetrics, setStoryMetrics] = useState<StoryResponse["metrics"] | null>(null);
  const firstReady = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    const t0 = performance.now();
    firstReady.current = false;
    let alive = true;

    const setStep = (key: string, label: string, state: StepState) => {
      if (!alive) return;
      setStatus((s) => {
        const i = s.findIndex((x) => x.key === key);
        if (i === -1) return [...s, { key, label, state }];
        const next = s.slice();
        next[i] = { key, label, state };
        return next;
      });
    };

    const tick = window.setInterval(() => {
      if (!firstReady.current) setElapsed(Math.floor((performance.now() - t0) / 1000));
    }, 250);

    async function run() {
      // ---- ready-made golden story: bundled, works offline ----
      if (id === "golden") {
        setStep("open", "OPENING THE READY STORY", "pending");
        try {
          const mod = (await import("@/data/golden/story.json")) as unknown as { default?: unknown };
          const story = (mod.default ?? mod) as unknown;
          if (!isPrepared(story)) throw new Error("The ready story is not drawn yet.");
          if (!alive) return;
          firstReady.current = true;
          setSource("golden");
          setPrepared(story);
          setStep("open", "OPENING THE READY STORY", "ok");
        } catch (e) {
          setStep("open", "OPENING THE READY STORY", "fail");
          setError((e as Error).message);
        }
        return;
      }

      const req = loadRequest(id);
      if (!req) {
        setError("This story has drifted away. Let's start a new one.");
        return;
      }

      // ---- 1. Story Director (cached per tab so a reload does not regenerate) ----
      const storyKey = `fablecast:story:${id}`;
      let story = loadJSON<StoryResponse>(storyKey);
      setStep("write", "WRITING THE STORY", story ? "ok" : "pending");
      if (!story) {
        try {
          const body: StoryRequest = { premise: req.premise, theme: req.theme, tone: req.tone };
          story = await postJSON<StoryResponse>("/api/story", body, ac.signal);
          saveJSON(storyKey, story);
          countStory();
        } catch (e) {
          if (!alive) return;
          setStep("write", "WRITING THE STORY", "fail");
          const err = e as Error & { code?: string };
          setError(err.code === "LIMIT" ? err.message || "That's all the stories for tonight." : err.message);
          return;
        }
      }
      if (!alive || !story) return;
      setSource(story.source);
      setStoryWarnings(story.warnings ?? []);
      setStoryMetrics(story.metrics ?? null);
      setStep("write", "WRITING THE STORY", "ok");
      setStep("cast", `CASTING ${story.bible.agents.length} PERFORMERS`, "ok");

      const n = story.bible.scenes.length;
      const base: PreparedStory = {
        storyId: story.storyId,
        bible: story.bible,
        casting: story.casting,
        scenes: Array.from({ length: n }, () => null),
      };
      setPrepared(base);

      // ---- 2. every scene, scene 0 first, a few at a time ----
      let next = 0;
      const one = async (index: number) => {
        const label = `VOICING PAGE ${index + 1}`;
        setStep(`scene${index}`, label, "pending");
        const body: SceneRequest = { bible: story!.bible, index, casting: story!.casting };
        let result: SceneResult | null = null;
        for (let attempt = 0; attempt < 2 && !result; attempt++) {
          try {
            result = await postJSON<SceneResult>("/api/scene", body, ac.signal);
          } catch (e) {
            if (ac.signal.aborted) return;
            if (attempt === 1) console.warn(`scene ${index} failed`, e);
          }
        }
        if (!alive) return;
        if (!result) {
          setStep(`scene${index}`, label, "fail");
          if (index === 0) setError("The pen ran dry on page 1.");
          return;
        }
        if (index === 0) firstReady.current = true;
        setStep(`scene${index}`, label, "ok");
        setPrepared((p) => {
          if (!p) return p;
          const scenes = p.scenes.slice();
          scenes[index] = result;
          return { ...p, scenes };
        });
      };
      const worker = async () => {
        while (alive && next < n) await one(next++);
      };
      await Promise.all(Array.from({ length: Math.min(MAX_IN_FLIGHT, n) }, worker));
    }

    run();
    return () => {
      alive = false;
      ac.abort();
      window.clearInterval(tick);
    };
  }, [id]);

  const pageOneReady = !!prepared && !!prepared.scenes[0];
  const timedOut = !pageOneReady && !error && elapsed >= MAX_GENERATION_SECONDS;

  return { prepared, status, error, elapsed, timedOut, source, storyWarnings, storyMetrics };
}

// ---------------- Convex path ----------------

// React strict mode runs effects twice in dev: share one create() per story so it never runs twice.
const creating = new Map<string, Promise<{ storyId: Id<"stories">; storiesLeft: number }>>();

async function loadGolden(): Promise<PreparedStory> {
  const mod = (await import("@/data/golden/story.json")) as unknown as { default?: unknown };
  const story = (mod.default ?? mod) as unknown;
  if (!isPrepared(story)) throw new Error("The ready story is not drawn yet.");
  return story;
}

function useStoryConvex(id: string): StoryLoad {
  const isGolden = id === "golden";
  const create = useMutation(api.stories.create);
  const [convexId, setConvexId] = useState<Id<"stories"> | null>(null);
  const [golden, setGolden] = useState<PreparedStory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const firstReady = useRef(false);
  const results = useRef(new Map<number, SceneResult>());
  const data = useQuery(api.stories.get, convexId ? { storyId: convexId } : "skip");

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    firstReady.current = false;
    results.current = new Map();
    setError(null);
    setConvexId(null);
    setGolden(null);
    const tick = window.setInterval(() => {
      if (!firstReady.current) setElapsed(Math.floor((performance.now() - t0) / 1000));
    }, 250);
    (async () => {
      if (isGolden) {
        try {
          const g = await loadGolden();
          if (!alive) return;
          firstReady.current = true;
          setGolden(g);
        } catch (e) {
          if (alive) setError((e as Error).message);
        }
        return;
      }
      const req = loadRequest(id);
      if (!req) {
        setError("This story has drifted away. Let's start a new one.");
        return;
      }
      const key = `fablecast:convex:${id}`;
      const have = loadJSON<string>(key);
      if (have) {
        setConvexId(have as Id<"stories">);
        return;
      }
      let p = creating.get(id);
      if (!p) {
        p = create({ premise: req.premise, theme: req.theme, tone: req.tone, sessionId: browserSessionId() });
        creating.set(id, p);
        p.then((r) => {
          saveJSON(key, r.storyId);
          countStory();
        }).catch(() => creating.delete(id));
      }
      try {
        const r = await p;
        if (alive) setConvexId(r.storyId);
      } catch (e) {
        if (!alive) return;
        const d = e instanceof ConvexError ? (e.data as { message?: string }) : null;
        setError(d?.message ?? (e as Error).message);
      }
    })();
    return () => {
      alive = false;
      window.clearInterval(tick);
    };
  }, [id, isGolden, create]);

  const response = (data?.response ?? null) as StoryResponse | null;
  // Keep each finished page's object stable so the player only recompiles when a new page lands.
  for (const s of data?.scenes ?? []) {
    if (s.status === "ready" && s.result && !results.current.has(s.index)) results.current.set(s.index, s.result as SceneResult);
  }
  const readyKey = [...results.current.keys()].sort((a, b) => a - b).join(",");
  const prepared = useMemo<PreparedStory | null>(() => {
    if (isGolden) return golden;
    if (!response) return null;
    const n = response.bible.scenes.length;
    return {
      storyId: response.storyId,
      bible: response.bible,
      casting: response.casting,
      scenes: Array.from({ length: n }, (_, i) => results.current.get(i) ?? null),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGolden, golden, response?.storyId, readyKey]);
  if (prepared?.scenes[0]) firstReady.current = true;

  const status: StatusLine[] = [];
  if (isGolden) status.push({ key: "open", label: "OPENING THE READY STORY", state: golden ? "ok" : error ? "fail" : "pending" });
  else {
    const st = data?.status;
    status.push({ key: "write", label: "WRITING THE STORY", state: st === "ready" ? "ok" : st === "failed" ? "fail" : "pending" });
    if (response) status.push({ key: "cast", label: `CASTING ${response.bible.agents.length} PERFORMERS`, state: "ok" });
    for (const s of data?.scenes ?? []) {
      status.push({ key: `scene${s.index}`, label: `VOICING PAGE ${s.index + 1}`, state: s.status === "ready" ? "ok" : s.status === "failed" ? "fail" : "pending" });
    }
  }
  let err = error;
  if (!err && data?.status === "failed") err = data.error ?? "The pen ran dry.";
  if (!err && data?.scenes.find((s) => s.index === 0)?.status === "failed") err = "The pen ran dry on page 1.";

  const pageOneReady = !!prepared && !!prepared.scenes[0];
  const timedOut = !pageOneReady && !err && elapsed >= MAX_GENERATION_SECONDS;
  return {
    prepared,
    status,
    error: err,
    elapsed,
    timedOut,
    source: isGolden ? "golden" : response?.source ?? null,
    storyWarnings: response?.warnings ?? [],
    storyMetrics: response?.metrics ?? null,
  };
}

/** The story loader: Convex when configured, else the Next.js API routes. */
export const useStory: (id: string) => StoryLoad = CONVEX_URL ? useStoryConvex : useStoryApi;

// GET /api/health: which providers are configured and which path each will take. No network calls
// unless ?ping=1. Never echoes secrets.
import { NextRequest, NextResponse } from "next/server";
import type { HealthResponse } from "@/lib/api-types";
import { cacheStats } from "@/lib/cache";
import { env, modes } from "@/lib/env";
import { dailyUsage } from "@/lib/limits";
import { breakerOpen, errMsg, withTimeout } from "@/lib/resilience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ping(url: string, headers: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
  try {
    return await withTimeout(5000, async (signal) => {
      const res = await fetch(url, { headers, signal });
      return { ok: res.ok, detail: `HTTP ${res.status}` };
    });
  } catch (err) {
    return { ok: false, detail: errMsg(err).slice(0, 80) };
  }
}

export async function GET(req: NextRequest) {
  const e = env();
  const m = modes(e);
  const doPing = req.nextUrl.searchParams.get("ping") === "1";
  const providers: HealthResponse["providers"] = [];

  const add = async (name: string, configured: boolean, mode: string, breaker: string, pingUrl: string, headers: Record<string, string>) => {
    let detail = configured ? `KEY SET · MODE ${mode.toUpperCase()}` : `NO KEY · MODE ${mode.toUpperCase()}`;
    let ok = configured && !breakerOpen(breaker);
    if (breakerOpen(breaker)) detail += " · CIRCUIT OPEN";
    if (doPing && configured) {
      const p = await ping(pingUrl, headers);
      ok = p.ok;
      detail += ` · PING ${p.detail}`;
    }
    providers.push({ name, ok, detail });
  };

  await add("CLAUDE", !!e.anthropicKey, m.claude, "claude", "https://api.anthropic.com/v1/models", { "x-api-key": e.anthropicKey, "anthropic-version": "2023-06-01" });
  await add("JEV", !!e.jevKey, m.jev, "jev", "https://api.typesafe.ai/v1/models", { Authorization: `Bearer ${e.jevKey}` });
  await add("ELEVENLABS", !!e.elevenKey, m.voice, "eleven", "https://api.elevenlabs.io/v1/user", { "xi-api-key": e.elevenKey });
  const c = cacheStats();
  providers.push({ name: "CACHE", ok: true, detail: `${c.entries} ENTRIES · ${c.hits} HITS · ${c.files ? "MEMORY+FILES" : "MEMORY"}` });

  const usage = dailyUsage();
  const body: HealthResponse = {
    providers,
    config: {
      storyModel: e.storyModel,
      stagingModel: e.stagingModel,
      jevModel: e.jevModel,
      voiceProvider: e.voiceProvider,
      voiceMode: e.voiceMode,
      agentFloor: e.agentFloor,
      wordsPerSecond: e.wordsPerSecond,
      inkMode: e.inkMode,
      cacheVersion: e.cacheVersion,
      maxStorySeconds: e.maxStorySeconds,
      targetSeconds: e.targetSeconds,
      maxGenerationSeconds: e.maxGenerationSeconds,
      maxSessionMinutes: e.maxSessionMinutes,
      maxStoriesPerSession: e.maxStoriesPerSession,
      maxDailyClaudeTokens: e.maxDailyClaudeTokens,
      maxDailyElevenChars: e.maxDailyElevenChars,
      claudeTokensToday: usage.claudeTokens,
      elevenCharsToday: usage.elevenChars,
      mockClaude: e.mockClaude,
      mockJev: e.mockJev,
      mockAudio: e.mockAudio,
    },
  };
  return NextResponse.json(body);
}

// Spend and time guards, enforced on the server (readme 9.2, 11.3).
// Per browser session (httpOnly cookie id) and per day (all users). In memory: per server instance.
import { randomUUID } from "node:crypto";
import { env } from "./env";

export const SESSION_COOKIE = "fc_session";

interface Session { startedAt: number; stories: Set<string>; lastAt: number }
const sessions = new Map<string, Session>();

const daily = { day: "", claudeTokens: 0, elevenChars: 0 };
function today() {
  const d = new Date().toISOString().slice(0, 10);
  if (daily.day !== d) {
    daily.day = d;
    daily.claudeTokens = 0;
    daily.elevenChars = 0;
  }
  return daily;
}

export function addClaudeTokens(n: number) {
  today().claudeTokens += n;
}
export function addElevenChars(n: number) {
  today().elevenChars += n;
}

/** True when the daily Claude budget is spent (0 = no cap). */
export function claudeBudgetSpent(): boolean {
  const cap = env().maxDailyClaudeTokens;
  return cap > 0 && today().claudeTokens >= cap;
}

/** True when sending `chars` more to ElevenLabs would pass the daily cap (0 = no cap). */
export function elevenBudgetSpent(chars: number): boolean {
  const cap = env().maxDailyElevenChars;
  return cap > 0 && today().elevenChars + chars > cap;
}

/** Raise this instance's counters to the durable totals (Convex keeps them across instances). */
export function syncDaily(claudeTokens: number, elevenChars: number) {
  const d = today();
  d.claudeTokens = Math.max(d.claudeTokens, claudeTokens);
  d.elevenChars = Math.max(d.elevenChars, elevenChars);
}

export function dailyUsage() {
  const d = today();
  return { claudeTokens: d.claudeTokens, elevenChars: d.elevenChars };
}

/** Read or mint the session id. Returns the id and whether the cookie must be set on the response. */
export function sessionId(cookieValue: string | undefined): { id: string; fresh: boolean } {
  if (cookieValue && /^[a-f0-9-]{36}$/.test(cookieValue)) return { id: cookieValue, fresh: false };
  return { id: randomUUID(), fresh: true };
}

function session(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = { startedAt: Date.now(), stories: new Set(), lastAt: Date.now() };
    sessions.set(id, s);
  }
  s.lastAt = Date.now();
  if (sessions.size > 5000) {
    for (const [k, v] of sessions) if (Date.now() - v.lastAt > 6 * 3600_000) sessions.delete(k);
  }
  return s;
}

export interface LimitCheck { ok: boolean; reason?: string; storiesLeft: number }

/**
 * Check whether this session may generate a story for `premiseKey`.
 * A premise already generated in this session does not count twice.
 */
export function checkStory(id: string, premiseKey: string): LimitCheck {
  const e = env();
  const s = session(id);
  const left = Math.max(0, e.maxStoriesPerSession - s.stories.size);
  if (s.stories.has(premiseKey)) return { ok: true, storiesLeft: left };
  if (e.maxSessionMinutes > 0 && Date.now() - s.startedAt > e.maxSessionMinutes * 60_000) {
    return { ok: false, reason: `Session time limit reached (${e.maxSessionMinutes} min).`, storiesLeft: left };
  }
  if (e.maxStoriesPerSession > 0 && s.stories.size >= e.maxStoriesPerSession) {
    return { ok: false, reason: `Story limit reached (${e.maxStoriesPerSession} per session).`, storiesLeft: 0 };
  }
  return { ok: true, storiesLeft: left };
}

/** Record a generated story; returns stories left after it. */
export function recordStory(id: string, premiseKey: string): number {
  const e = env();
  const s = session(id);
  s.stories.add(premiseKey);
  return Math.max(0, e.maxStoriesPerSession - s.stories.size);
}

/** Scene requests are allowed while the session is within its time window. */
export function checkScene(id: string): LimitCheck {
  const e = env();
  const s = session(id);
  const left = Math.max(0, e.maxStoriesPerSession - s.stories.size);
  // Allow a grace period past the session limit so a story that already started can finish.
  if (e.maxSessionMinutes > 0 && Date.now() - s.startedAt > (e.maxSessionMinutes + 10) * 60_000) {
    return { ok: false, reason: "Session time limit reached.", storiesLeft: left };
  }
  return { ok: true, storiesLeft: left };
}

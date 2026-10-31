// Composer (readme 8.3): a pure function from a routing decision to performed text + voice settings.
// At most 2 audio tags per line (mood tags plus a pause tag). eleven_v3 has no SSML breaks, so pauses
// use [short pause] / [long pause] tags and an ellipsis.
import type { MoodAgent, Tone } from "./schemas";
import { samePerformance, TONES } from "./tones";

export type Pause = "none" | "short" | "long";

export interface Composed {
  performed: string; // sent to TTS, with tags
  display: string; // shown in captions, tags stripped
  tags: string[];
  settings: { stability: number; style: number };
}

/** Remove [tags] and collapse whitespace. */
export function stripTags(s: string): string {
  return s.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTag(t: string): string | null {
  const v = t.replace(/[[\]]/g, "").replace(/[^a-zA-Z \-']/g, "").trim().toLowerCase();
  return v && v.length <= 40 ? v : null;
}

/** eleven_v3 stability only accepts 0 (creative), 0.5 (natural) or 1 (robust). */
export function snapStability(s: number): number {
  return s < 0.25 ? 0 : s < 0.75 ? 0.5 : 1;
}

export function compose(
  text: string, agent: MoodAgent | undefined, intensity: 0 | 1 | 2, pause: Pause,
  opts: { performed?: string; tone?: Tone; pauses?: boolean } = {},
): Composed {
  const display = stripTags(text);
  const pauses = opts.pauses ?? true;
  const pauseTag = !pauses ? null : pause === "short" ? "short pause" : pause === "long" ? "long pause" : null;
  const toneStability = opts.tone ? TONES[opts.tone].stability : undefined;
  // Claude's acted version (inline tags where the feeling changes) beats one generic tag at the start.
  if (samePerformance(display, opts.performed)) {
    // Pause tags slow the read a lot; without them the acted punctuation sets the pace.
    const acted = (pauses ? opts.performed! : opts.performed!.replace(/\[(short |long )?pause\]/gi, " ")).replace(/\s+/g, " ").trim();
    const tags = (acted.match(/\[[^\]]+\]/g) ?? []).map((t) => t.slice(1, -1).trim().toLowerCase());
    const endsPaused = /\[(short |long )?pause\]\s*$/i.test(acted);
    const performed = pauseTag && !endsPaused ? `${acted} [${pauseTag}]` : acted;
    return {
      performed,
      display,
      tags: pauseTag && !endsPaused ? [...tags, pauseTag] : tags,
      settings: { stability: toneStability ?? 0, style: Math.min(1, 0.45 + intensity * 0.2) },
    };
  }
  const moodBudget = Math.min(pauseTag ? 1 : 2, intensity === 2 ? 2 : 1);
  const palette = agent?.tagPalette[intensity] ?? [];
  const moodTags: string[] = [];
  for (const t of palette) {
    const c = cleanTag(t);
    if (c && !moodTags.includes(c)) moodTags.push(c);
    if (moodTags.length >= moodBudget) break;
  }
  let body = display;
  if (pause === "long" && !/(\.\.\.|…)$/.test(body)) body = body.replace(/[.!,;:]+$/, "") + "...";
  if (pause !== "none" && !/[.!?…]$/.test(body)) body += ".";
  const head = moodTags.map((t) => `[${t}]`).join(" ");
  const performed = [head, body, pauseTag ? `[${pauseTag}]` : ""].filter(Boolean).join(" ");
  const base = agent?.voiceSettings ?? { stability: 0.5, style: 0.3 };
  return {
    performed,
    display,
    tags: pauseTag ? [...moodTags, pauseTag] : moodTags,
    settings: {
      stability: toneStability ?? snapStability(base.stability - (intensity === 2 ? 0.3 : 0)),
      style: Math.min(1, Math.max(0, base.style + (intensity - 1) * 0.15)),
    },
  };
}

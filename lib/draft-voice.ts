// Draft voice mode (readme 9.3): no ElevenLabs calls. Line and word times are estimated from word counts.
// Audio is silent (src null): the player runs its clock on wall time and may use speechSynthesis.
import type { SceneAudio, WordTime } from "./api-types";
import type { Pause } from "./composer";

export const PAUSE_GAP: Record<Pause, number> = { none: 0.15, short: 0.45, long: 0.9 };

export function draftAudio(displayLines: string[], pauses: Pause[], wordsPerSecond: number): SceneAudio {
  const wps = wordsPerSecond > 0 ? wordsPerSecond : 2.5;
  let t = 0.1;
  const lines = displayLines.map((text, i) => {
    const words = text.split(/\s+/).filter(Boolean);
    const dur = Math.max(0.9, words.length / wps + 0.2);
    const weights = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 2);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const start = t;
    let acc = start;
    const wt: WordTime[] = words.map((w, k) => {
      const d = (weights[k] / total) * dur;
      const word = { text: w, start: round(acc), end: round(acc + d * 0.92) };
      acc += d;
      return word;
    });
    const end = start + dur;
    t = end + PAUSE_GAP[pauses[i] ?? "short"];
    return { start: round(start), end: round(end), words: wt };
  });
  const last = lines[lines.length - 1];
  return { provider: "draft", src: null, duration: round((last ? last.end : 0) + 0.4), lines };
}

/**
 * Planning estimate of summed scene audio in seconds (readme 9.2): words / wps + a per-line gap + a per-scene lead.
 * Kept an upper bound of draftAudio() (0.2 s per line + pauses up to 0.45 s, 0.5 s per scene).
 */
export function estimateSeconds(wordCount: number, lineCount: number, sceneCount: number, wps: number): number {
  return wordCount / (wps || 2.5) + lineCount * 0.75 + sceneCount * 0.6;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

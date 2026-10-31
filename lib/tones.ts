// Story tones the family can pick on Home. Each one steers the Story Director (what happens and how it
// is told) and the ElevenLabs v3 performance (which audio tags to act with, and how free the delivery is).
import type { Tone } from "./schemas";

export interface ToneSpec {
  label: string; // Home chip
  story: string; // Story Director guidance
  pace: string; // how fast the telling moves, for the narrator and the characters
  tags: string[]; // preferred v3 audio tags for this tone
  stability: 0 | 0.5; // eleven_v3: 0 = creative (wilder, less consistent), 0.5 = natural (tags still act)
}

export const TONES: Record<Tone, ToneSpec> = {
  cozy: {
    label: "COZY",
    story: "Warm and safe: small comforts, kind friends, soft surprises. Snug blankets, glowing windows, cocoa-warm feelings.",
    pace: "Mid pace and warm, quicker and brighter for the fun bits; slow only for the snuggly last lines.",
    tags: ["softly", "warmly", "gently", "whispers", "chuckles softly", "sighs happily", "smiling"],
    stability: 0.5,
  },
  silly: {
    label: "SILLY",
    story: "Playful and funny: mix-ups, giggles, funny sounds and words, a character who tries too hard. Big silly feelings.",
    pace: "Brisk and bouncy: quick lines, fast back-and-forth jokes, comic timing; never let it sag.",
    tags: ["giggles", "laughs", "playfully", "mischievously", "excited", "gasps", "snorts", "silly voice"],
    stability: 0.5,
  },
  adventure: {
    label: "ADVENTURE",
    story: "A brave little quest: a journey, a small challenge, teamwork, a proud win, then home to bed.",
    pace: "Fast and exciting: short, punchy lines that speed up in the action and land the big moment; calm only at bedtime.",
    tags: ["excited", "bravely", "determined", "gasps", "breathless", "cheering", "whispers"],
    stability: 0.5,
  },
  spooky: {
    label: "A LITTLE SPOOKY",
    story: "Gently mysterious, never scary: creaks and shadows that turn out to be friendly. Suspense, then relief and a laugh.",
    pace: "Mostly mid pace; one short whispery build-up, then quick, breathless reveals and a fast relieved laugh.",
    tags: ["whispers", "mysteriously", "nervously", "gasps", "trembling", "slowly", "relieved sigh", "laughs nervously"],
    stability: 0.5,
  },
  dreamy: {
    label: "DREAMY",
    story: "Slow and floaty: clouds, stars, moonbeams, drifting off. Very calm, soothing, with a sleepy ending.",
    pace: "Calm mid pace that keeps flowing; slow only at the very end as everyone drifts off.",
    tags: ["softly", "dreamily", "sleepily", "yawns", "sighs", "whispers", "slowly"],
    stability: 0.5,
  },
};

export const TONE_IDS = Object.keys(TONES) as Tone[];
export const DEFAULT_TONE: Tone = "cozy";

const words = (s: string) =>
  s
    .replace(/\[[^\]]*\]/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** A performance is usable only if it speaks exactly the caption's words, in order (captions stay in sync). */
export function samePerformance(text: string, performed: string | undefined): boolean {
  if (!performed || !/\[[^\]]+\]/.test(performed)) return false;
  const a = words(text);
  const b = words(performed);
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

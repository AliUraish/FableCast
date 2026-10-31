// Deterministic voice casting (readme 8.4): score each pool voice against an agent's voiceTraits,
// assign the best unused one, keep it for the whole story. narrator_default always gets the narrator slot.
import voicesFile from "@/data/voices.json";
import type { Casting } from "./api-types";
import { NARRATOR, NARRATOR_AGENT, type Line, type MoodAgent, type StoryBible } from "./schemas";

interface PoolVoice { id: string; name: string; slot: string; age: string; gender: string; quality: string[] }
const POOL: PoolVoice[] = voicesFile.voices;

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
}

function score(v: PoolVoice, a: MoodAgent): number {
  let s = 0;
  if (v.age === a.voiceTraits.age) s += 3;
  if (a.voiceTraits.gender === "neutral") s += 1;
  else if (v.gender === a.voiceTraits.gender) s += 2;
  const q = new Set([...words(a.voiceTraits.quality), ...words(a.mood)]);
  for (const w of v.quality) if (q.has(w)) s += 1;
  if (v.slot === "narrator") s -= 0.5; // keep the narrator slot for the narrator when possible
  return s;
}

const entry = (v: PoolVoice) => ({ voiceId: v.id, name: v.name, slot: v.slot });

/** agentId -> voice, plus `char:<id>` entries (VOICE_MODE=cast or locked). The narrator's gender follows the bible. */
export function castVoices(bible: StoryBible): Casting {
  const narrator =
    (bible.narrator?.gender === "female" ? POOL.find((v) => v.slot === "adult_f") : POOL.find((v) => v.slot === "narrator")) ?? POOL[0];
  const casting: Casting = { [NARRATOR_AGENT]: entry(narrator) };
  const used = new Set<string>([narrator.id]);
  for (const a of bible.agents) {
    const ranked = [...POOL].sort((x, y) => score(y, a) - score(x, a) || x.id.localeCompare(y.id));
    const pick = ranked.find((v) => !used.has(v.id)) ?? ranked[0];
    used.add(pick.id);
    casting[a.id] = entry(pick);
  }
  // Each character keeps one voice that matches its gender and age (best unused; the narrator's is never reused).
  const charUsed = new Set<string>([narrator.id]);
  for (const c of bible.characters) {
    const want = c.voice;
    const fit = (v: PoolVoice) =>
      (want ? (v.gender === want.gender ? 4 : 0) + (v.age === want.age ? 3 : 0) : 0) + (v.slot === "narrator" ? -2 : 0);
    const pick = [...POOL].filter((v) => !charUsed.has(v.id)).sort((x, y) => fit(y) - fit(x) || x.id.localeCompare(y.id))[0] ?? POOL[1];
    charUsed.add(pick.id);
    casting[`char:${c.id}`] = entry(pick);
  }
  return casting;
}

/**
 * Which voice speaks a line. Cast (default): the narrator reads narration and each character speaks its own
 * dialogue in its own voice. Ensemble: the chosen mood agent. Locked: the voice of the character the line is about.
 */
export function voiceFor(casting: Casting, line: Line, agentId: string, mode: "cast" | "ensemble" | "locked") {
  const narrator = casting[NARRATOR_AGENT];
  if (mode === "cast") {
    const who = line.speaker && line.speaker !== NARRATOR ? line.speaker : null;
    return (who && casting[`char:${who}`]) || narrator;
  }
  if (mode === "locked") {
    if (line.character === NARRATOR) return narrator;
    return casting[`char:${line.character}`] ?? narrator;
  }
  return casting[agentId] ?? narrator;
}

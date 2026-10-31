// ElevenLabs voices with timestamps (readme 9.1, 9.4).
// Chain: Text-to-Dialogue (one call per scene) -> single-voice TTS per line -> (cache) -> draft.
import type { SceneAudio, WordTime } from "./api-types";
import { HttpError, withTimeout } from "./resilience";
import { addElevenChars } from "./limits";

const EL = "https://api.elevenlabs.io/v1";
const MAX_DIALOGUE_CHARS = 1800; // docs: keep a dialogue request at or below 2,000 characters

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
interface VoiceSegment {
  voice_id: string;
  start_time_seconds: number;
  end_time_seconds: number;
  character_start_index: number;
  character_end_index: number;
  dialogue_input_index: number;
}
interface DialogueResponse {
  audio_base64: string;
  voice_segments?: VoiceSegment[];
  alignment: Alignment | null;
  normalized_alignment?: Alignment | null;
}
interface TtsResponse {
  audio_base64: string;
  alignment: Alignment | null;
  normalized_alignment?: Alignment | null;
}

export interface TtsLine {
  performed: string; // with [tags]
  display: string; // what captions show
  voiceId: string;
  stability: number;
  style: number;
}

/**
 * POST to ElevenLabs. Concurrency and rate limits (429) are waited out, not fallen back from: plans allow
 * only a few requests at once and the pages of a story are voiced in parallel, so a page queues behind the
 * others (up to `queueMs`). Other transient errors get 3 retries; client errors throw at once.
 */
async function post<T>(key: string, url: string, body: unknown, timeoutMs: number, queueMs = 150_000): Promise<T> {
  const deadline = Date.now() + queueMs;
  let transient = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(timeoutMs, async (signal) => {
        const res = await fetch(url, {
          method: "POST",
          signal,
          headers: { "xi-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new HttpError(res.status, `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return (await res.json()) as T;
      });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      const busy = status === 429;
      const retryable = busy || status === 0 || status >= 500 || status === 408 || status === 409;
      if (!retryable || Date.now() > deadline || (!busy && ++transient > 3)) throw err;
      const wait = Math.min(4000, 700 * 1.5 ** Math.min(attempt, 4)) * (0.6 + Math.random() * 0.8);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Words with times from alignment characters in [from, to), ignoring characters inside [...]. */
export function wordsFromAlignment(a: Alignment, from: number, to: number): WordTime[] {
  const out: WordTime[] = [];
  let cur = "";
  let ws = 0;
  let we = 0;
  let inTag = false;
  const flush = () => {
    if (cur) out.push({ text: cur, start: ws, end: we });
    cur = "";
  };
  const end = Math.min(to, a.characters.length);
  for (let i = Math.max(0, from); i < end; i++) {
    const c = a.characters[i];
    if (c === "[") { flush(); inTag = true; continue; }
    if (inTag) { if (c === "]") inTag = false; continue; }
    if (/\s/.test(c)) { flush(); continue; }
    if (!cur) ws = a.character_start_times_seconds[i];
    cur += c;
    we = a.character_end_times_seconds[i];
  }
  flush();
  // Fold punctuation-only tokens (e.g. a stray "...") into the previous word.
  const merged: WordTime[] = [];
  for (const w of out) {
    if (!/[\p{L}\p{N}]/u.test(w.text) && merged.length) {
      const prev = merged[merged.length - 1];
      prev.text += w.text;
      prev.end = w.end;
    } else merged.push({ ...w });
  }
  return merged;
}

/**
 * Captions must show the display words exactly. Take timing from the aligned words when the counts
 * match, otherwise spread the line's time over the display words by length.
 */
export function fitWords(display: string, aligned: WordTime[], start: number, end: number): WordTime[] {
  const words = display.split(/\s+/).filter(Boolean);
  if (aligned.length === words.length) return words.map((text, i) => ({ text, start: aligned[i].start, end: aligned[i].end }));
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = start;
  return words.map((text, i) => {
    const d = ((end - start) * weights[i]) / total;
    const w = { text, start: acc, end: acc + d * 0.92 };
    acc += d;
    return w;
  });
}

/** Locate each input's character range when voice_segments are missing: inputs are joined in order. */
function rangesByText(a: Alignment, inputs: string[]): [number, number][] {
  const joined = a.characters.join("");
  const ranges: [number, number][] = [];
  let pos = 0;
  for (const t of inputs) {
    const probe = t.slice(0, Math.min(12, t.length));
    const found = joined.indexOf(probe, pos);
    const s = found >= 0 ? found : pos;
    const e = Math.min(joined.length, s + t.length);
    ranges.push([s, e]);
    pos = e;
  }
  return ranges;
}

async function dialogueChunk(key: string, lines: TtsLine[], timeoutMs: number) {
  const stability = lines[0]?.stability ?? 0.5;
  const body = { model_id: "eleven_v3", inputs: lines.map((l) => ({ text: l.performed, voice_id: l.voiceId })), settings: { stability } };
  addElevenChars(lines.reduce((n, l) => n + l.performed.length, 0));
  const r = await post<DialogueResponse>(key, `${EL}/text-to-dialogue/with-timestamps?output_format=mp3_44100_128`, body, timeoutMs);
  const a = r.alignment ?? r.normalized_alignment;
  if (!a || !r.audio_base64) throw new Error("dialogue response missing audio or alignment");
  const segs = r.voice_segments ?? [];
  const textRanges = segs.length ? null : rangesByText(a, lines.map((l) => l.performed));
  const out = lines.map((l, i) => {
    const mine = segs.filter((s) => s.dialogue_input_index === i);
    let from: number, to: number, start: number, end: number;
    if (mine.length) {
      from = Math.min(...mine.map((s) => s.character_start_index));
      to = Math.max(...mine.map((s) => s.character_end_index));
      start = Math.min(...mine.map((s) => s.start_time_seconds));
      end = Math.max(...mine.map((s) => s.end_time_seconds));
    } else {
      [from, to] = textRanges![i];
      const aw = wordsFromAlignment(a, from, to);
      start = aw[0]?.start ?? 0;
      end = aw[aw.length - 1]?.end ?? start + 1;
    }
    const aligned = wordsFromAlignment(a, from, to);
    return { start, end, words: fitWords(l.display, aligned, start, end) };
  });
  const lastEnd = Math.max(...a.character_end_times_seconds, ...out.map((o) => o.end));
  return { audio: Buffer.from(r.audio_base64, "base64"), lines: out, duration: lastEnd };
}

/** One dialogue take per scene (split into chunks under the character limit; MP3 frames concatenate). */
export async function dialogueTake(key: string, lines: TtsLine[], timeoutMs = 45_000): Promise<SceneAudio> {
  {
    const chunks: TtsLine[][] = [];
    let cur: TtsLine[] = [];
    let n = 0;
    for (const l of lines) {
      if (cur.length && n + l.performed.length > MAX_DIALOGUE_CHARS) {
        chunks.push(cur);
        cur = [];
        n = 0;
      }
      cur.push(l);
      n += l.performed.length;
    }
    if (cur.length) chunks.push(cur);
    // One request at a time per page: plans cap concurrent requests, and other pages are voicing too.
    const parts = [];
    for (const c of chunks) parts.push(await dialogueChunk(key, c, timeoutMs));
    return stitch(parts, "eleven");
  }
}

/** Fallback: single-voice TTS per line, stitched. */
export async function singleVoiceTake(key: string, lines: TtsLine[], timeoutMs = 45_000): Promise<SceneAudio> {
  {
    const parts = [];
    for (const l of lines) {
      parts.push(await (async () => {
        addElevenChars(l.performed.length);
        const r = await post<TtsResponse>(
          key,
          `${EL}/text-to-speech/${encodeURIComponent(l.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
          { text: l.performed, model_id: "eleven_v3", voice_settings: { stability: l.stability, similarity_boost: 0.75, style: l.style } },
          timeoutMs,
        );
        const a = r.alignment ?? r.normalized_alignment;
        if (!a || !r.audio_base64) throw new Error("tts response missing audio or alignment");
        const aligned = wordsFromAlignment(a, 0, a.characters.length);
        const start = aligned[0]?.start ?? 0;
        const end = aligned[aligned.length - 1]?.end ?? start + 1;
        const duration = Math.max(end, ...a.character_end_times_seconds);
        return { audio: Buffer.from(r.audio_base64, "base64"), lines: [{ start, end, words: fitWords(l.display, aligned, start, end) }], duration };
      })());
    }
    return stitch(parts, "eleven_single");
  }
}

function stitch(
  parts: { audio: Buffer; lines: { start: number; end: number; words: WordTime[] }[]; duration: number }[],
  provider: SceneAudio["provider"],
): SceneAudio {
  let offset = 0;
  const lines: SceneAudio["lines"] = [];
  for (const p of parts) {
    for (const l of p.lines) {
      lines.push({
        start: r3(l.start + offset),
        end: r3(l.end + offset),
        words: l.words.map((w) => ({ text: w.text, start: r3(w.start + offset), end: r3(w.end + offset) })),
      });
    }
    offset += p.duration;
  }
  const audio = Buffer.concat(parts.map((p) => p.audio));
  return { provider, src: `data:audio/mpeg;base64,${audio.toString("base64")}`, duration: r3(offset), lines };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

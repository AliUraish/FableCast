// pnpm golden: build data/golden/story.json from data/golden/source.ts with draft-voice timings.
// (Run it again after a real ElevenLabs take to bake real audio in; see README.)
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Casting, PreparedStory, SceneResult } from "@/lib/api-types";
import { bible, decisions, staging } from "@/data/golden/source";
import { StoryBible, SceneStaging } from "@/lib/schemas";

const WPS = 2.5;
const GAP = { none: 0.15, short: 0.45, long: 0.9 } as const;

function draftTimes(texts: string[], pauses: (keyof typeof GAP)[]) {
  let t = 0;
  return texts.map((text, i) => {
    const ws = text.split(/\s+/).filter(Boolean);
    const dur = Math.max(0.8, ws.length / WPS);
    const total = ws.reduce((s, w) => s + w.length + 1, 0);
    let acc = t;
    const words = ws.map((w) => {
      const d = ((w.length + 1) / total) * dur;
      const wt = { text: w, start: +acc.toFixed(3), end: +(acc + d * 0.92).toFixed(3) };
      acc += d;
      return wt;
    });
    const line = { start: +t.toFixed(3), end: +(t + dur).toFixed(3), words };
    t += dur + GAP[pauses[i]];
    return line;
  });
}

StoryBible.parse(bible);
staging.forEach((s) => SceneStaging.parse(s));

const casting: Casting = {
  narrator_default: { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", slot: "narrator" },
  hush: { voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George", slot: "narrator" },
  wonder: { voiceId: "cgSgspJ2msm6clMCkdW9", name: "Jessica", slot: "child_f" },
  shiver: { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", slot: "child_m" },
  glow: { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", slot: "adult_f" },
};

const scenes: SceneResult[] = bible.scenes.map((sc, i) => {
  const ds = decisions[i];
  const lines = draftTimes(sc.lines.map((l) => l.text), ds.map((d) => d.pause));
  const agentOf = (id: string) => bible.agents.find((a) => a.id === id)!;
  return {
    sceneId: sc.id,
    index: i,
    staging: staging[i],
    stagingSource: "cache",
    decisions: ds,
    performed: sc.lines.map((l, li) => `[${agentOf(ds[li].agentId).tagPalette[ds[li].intensity][0]}] ${l.text}`),
    audio: { provider: "draft", src: null, duration: lines[lines.length - 1].end + 0.3, lines },
    metrics: { jevCalls: sc.lines.length, jevMsTotal: ds.reduce((s, d) => s + d.latencyMs, 0), elevenChars: 0, claudeTokens: 0, cacheHits: sc.lines.length + 1, resolvedJevModel: "jev-1.14.0", ms: 0 },
    warnings: [],
  };
});

const story: PreparedStory = {
  storyId: "golden-" + createHash("sha256").update(JSON.stringify(bible)).digest("hex").slice(0, 10),
  bible,
  casting,
  scenes,
};
writeFileSync(new URL("../data/golden/story.json", import.meta.url), JSON.stringify(story, null, 1));
console.log(`wrote data/golden/story.json (${scenes.length} pages, ${scenes.reduce((s, x) => s + x.audio.duration, 0).toFixed(1)} s of speech)`);

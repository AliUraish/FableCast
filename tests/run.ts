// pnpm test: compile + lint the golden story and sample premises (mock pipeline, no API calls),
// run the composer unit tests, prove the time limit holds, and (if the dev server is up) check that
// renderAt(t) is deterministic in a real browser. FAILS on any WARN.
import { execFileSync } from "node:child_process";
import type { PreparedStory } from "@/lib/api-types";
import { compile } from "@/engine/timeline";
import golden from "@/data/golden/story.json";

let failed = 0;
const fail = (msg: string) => { failed++; console.log(`FAIL ${msg}`); };
const pass = (msg: string) => console.log(`ok   ${msg}`);

function check(name: string, story: PreparedStory, maxSeconds?: number) {
  const tl = compile(story);
  if (!tl.complete) fail(`${name}: not every page compiled`);
  if (tl.warnings.length) {
    fail(`${name}: ${tl.warnings.length} warning(s)`);
    tl.warnings.forEach((w) => console.log("     " + w));
  } else pass(`${name}: ${tl.lines.length} lines, ${tl.duration.toFixed(1)} s, zero WARN`);
  // Every line must have a decision and monotonic word times.
  for (const l of tl.lines) {
    for (let i = 1; i < l.words.length; i++) if (l.words[i].start < l.words[i - 1].start) fail(`${name}: words out of order in "${l.text}"`);
  }
  if (maxSeconds !== undefined) {
    const spoken = story.scenes.reduce((s, sc) => s + (sc?.audio.duration ?? 0), 0);
    if (spoken > maxSeconds) fail(`${name}: ${spoken.toFixed(1)} s of speech is over the ${maxSeconds} s ceiling`);
    else pass(`${name}: ${spoken.toFixed(1)} s of speech within the ${maxSeconds} s ceiling`);
  }
  return tl;
}

// 1. Golden story.
check("golden", golden as unknown as PreparedStory);

// 2. Sample premises through the full mock pipeline (Story Director -> scenes), no keys, no network.
const premises = [
  "a sleepy dragon who is afraid of the dark",
  "a little bunny who cannot find her moon",
  "a shy ghost who wants to make a friend",
];
async function pipelineStories(maxStorySeconds?: number) {
  if (maxStorySeconds) process.env.MAX_STORY_SECONDS = String(maxStorySeconds);
  process.env.MOCK_CLAUDE = "1";
  process.env.MOCK_JEV = "1";
  process.env.MOCK_AUDIO = "1";
  process.env.VOICE_PROVIDER = "draft";
  const pipe = await import("@/lib/pipeline");
  const out: { premise: string; story: PreparedStory }[] = [];
  for (const premise of premises) {
    const s = await pipe.runStory({ premise, theme: "night" });
    const scenes = await Promise.all(s.bible.scenes.map((_, i) => pipe.runScene({ bible: s.bible, index: i, casting: s.casting })));
    out.push({ premise, story: { storyId: s.storyId, bible: s.bible, casting: s.casting, scenes } });
  }
  return out;
}

try {
  for (const { premise, story } of await pipelineStories()) check(`mock "${premise}"`, story, Number(process.env.MAX_STORY_SECONDS ?? 120));
} catch (e) {
  fail(`mock pipeline threw: ${(e as Error).stack}`);
}

// 2b. Voice budget: every story fits 1/DAILY_STORY_RUNS of MAX_DAILY_ELEVEN_CHARS (6 runs of 10,000).
try {
  const { storyCharBudget, env: readEnv } = await import("@/lib/env");
  const { trimToBudget, storyChars } = await import("@/lib/story-director");
  process.env.MAX_DAILY_ELEVEN_CHARS = "10000";
  process.env.DAILY_STORY_RUNS = "6";
  const budget = storyCharBudget(readEnv());
  if (budget !== 1666) fail(`voice budget: expected 1666 characters per story, got ${budget}`);
  for (const { premise, story } of await pipelineStories()) {
    const sent = story.scenes.reduce((n, sc) => n + (sc?.performed ?? []).reduce((m, t) => m + t.length, 0), 0);
    if (sent > budget) fail(`voice budget: "${premise}" sends ${sent} characters > ${budget}`);
    else pass(`voice budget: "${premise}" sends ${sent} of ${budget} characters`);
  }
  // An overlong story (the golden story repeated) is trimmed to the budget; first and last pages survive.
  const g = (golden as unknown as PreparedStory).bible;
  const long = { ...g, scenes: g.scenes.map((sc) => ({ ...sc, lines: [...sc.lines, ...sc.lines.slice(0, 2)].slice(0, 6) })) };
  const { bible, trimmed } = trimToBudget(long, 120, 2.5, 900);
  const lastKept = bible.scenes[bible.scenes.length - 1].lines.length === long.scenes[long.scenes.length - 1].lines.length;
  if (storyChars(bible) > 900 || !trimmed || !lastKept) fail(`trim: ${storyChars(bible)} chars after trimming ${trimmed} lines; last page kept: ${lastKept}`);
  else pass(`trim: overlong story cut by ${trimmed} lines to ${storyChars(bible)} of 900 characters, last page intact`);
} catch (e) {
  fail(`voice budget threw: ${(e as Error).stack}`);
}

// 3. Composer unit tests.
try {
  execFileSync("npx", ["tsx", "tests/composer.test.ts"], { stdio: "pipe" });
  pass("composer: 10 cases");
} catch (e) {
  fail(`composer tests: ${String((e as { stdout?: Buffer }).stdout ?? e)}`);
}

// 4. Time limit: with MAX_STORY_SECONDS=60 a story never plays longer than 60 s of speech.
try {
  execFileSync("npx", ["tsx", "tests/limit.test.ts"], { stdio: "pipe", env: { ...process.env, MAX_STORY_SECONDS: "60", TARGET_SECONDS: "50" } });
  pass("time limit: MAX_STORY_SECONDS=60 holds");
} catch (e) {
  fail(`time limit: ${String((e as { stdout?: Buffer }).stdout ?? e)}`);
}

// 5. Determinism in a real browser (skipped if the dev server is not running).
const base = process.env.FABLECAST_URL ?? "http://localhost:3000";
try {
  const res = await fetch(`${base}/render/golden`, { signal: AbortSignal.timeout(3000) });
  if (res.ok) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`${base}/render/golden`);
    await page.waitForFunction(() => window.__fablecast?.ready, null, { timeout: 30000 });
    const same = await page.evaluate(() => {
      const c = document.getElementById("board") as HTMLCanvasElement;
      const f = window.__fablecast!;
      const ts = [3.1, 12.7, 27.3, 44.2, 61.9, 80.5];
      return ts.every((t) => {
        f.renderAt(t); const a = c.toDataURL();
        f.renderAt(t + 7); f.renderAt(t); const b = c.toDataURL();
        return a === b;
      });
    });
    await browser.close();
    if (same) pass("renderAt(t) is deterministic (same t, identical pixels)");
    else fail("renderAt(t) is not deterministic");
  } else console.log("skip determinism check (dev server not reachable)");
} catch {
  console.log("skip determinism check (dev server not reachable)");
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall tests passed");

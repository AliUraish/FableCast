export {};
// Run with MAX_STORY_SECONDS=60: every generated story's speech must fit under the ceiling.
process.env.MOCK_CLAUDE = "1";
process.env.MOCK_JEV = "1";
process.env.MOCK_AUDIO = "1";
process.env.VOICE_PROVIDER = "draft";
const max = Number(process.env.MAX_STORY_SECONDS ?? 60);
const pipe = await import("@/lib/pipeline");
const premises = [
  "a sleepy dragon who is afraid of the dark and also very worried about thunder and owls and shadows",
  "a tiny turtle who wants to see the whole wide ocean before bedtime",
  "two best friend foxes who build a blanket fort",
];
let bad = 0;
for (const premise of premises) {
  const s = await pipe.runStory({ premise, theme: "night" });
  const scenes = await Promise.all(s.bible.scenes.map((_, i) => pipe.runScene({ bible: s.bible, index: i, casting: s.casting })));
  const spoken = scenes.reduce((sum, sc) => sum + sc.audio.duration, 0);
  if (spoken > max) {
    bad++;
    console.log(`over: "${premise}" ${spoken.toFixed(1)} s > ${max} s`);
  }
}
if (bad) process.exit(1);
console.log(`all stories within ${max} s`);

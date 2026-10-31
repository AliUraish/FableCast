// Composer unit tests (readme 8.3): 10 hand-written lines. Run: npx tsx tests/composer.test.ts
import { compose, snapStability, stripTags } from "../lib/composer";
import type { MoodAgent } from "../lib/schemas";

const hush: MoodAgent = {
  id: "hush", name: "Hush", mood: "calm", routingHints: ["calm", "sleepy"],
  voiceTraits: { age: "adult", gender: "female", quality: "soft" },
  tagPalette: [["softly"], ["warmly", "gently"], ["whispers", "slowly", "sighs"]],
  voiceSettings: { stability: 1, style: 0.2 }, ink: "white", wobble: 0.2,
};
const shiver: MoodAgent = {
  ...hush, id: "shiver", name: "Shiver", tagPalette: [["nervous"], ["[whispers]", "nervous"], ["scared!!", "whispers"]],
  voiceSettings: { stability: 0, style: 0.8 }, ink: "blue", wobble: 1.2,
};

let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (!cond) {
    failed++;
    console.error(`FAIL ${name} ${detail}`);
  } else console.log(`ok   ${name}`);
}
const tagCount = (s: string) => (s.match(/\[[^\]]*\]/g) ?? []).length;

// 1. calm line, no pause: one tag, display untouched
let c = compose("Once upon a time, there was a dragon.", hush, 0, "none");
check("1 calm tag", c.performed === "[softly] Once upon a time, there was a dragon.", c.performed);
// 2. display strips tags from input text
c = compose("[laughs] Hello there!", hush, 1, "none");
check("2 display stripped", c.display === "Hello there!", c.display);
// 3. short pause adds a pause tag and keeps <= 2 tags
c = compose("It was very dark", shiver, 1, "short");
check("3 short pause tag", c.performed.endsWith("[short pause]") && tagCount(c.performed) <= 2, c.performed);
// 4. long pause adds an ellipsis and a long pause tag
c = compose("And then they slept.", hush, 0, "long");
check("4 long pause", c.performed.includes("slept...") && c.performed.endsWith("[long pause]"), c.performed);
// 5. peak intensity, no pause: two mood tags
c = compose("Who is there?", shiver, 2, "none");
check("5 peak two tags", tagCount(c.performed) === 2, c.performed);
// 6. peak intensity with a pause: still at most two tags in total
c = compose("Who is there?", shiver, 2, "long");
check("6 tag cap", tagCount(c.performed) === 2, c.performed);
// 7. tag text is cleaned (brackets and punctuation removed)
c = compose("Run!", shiver, 2, "none");
check("7 tag cleaned", c.performed.startsWith("[scared] [whispers]"), c.performed);
// 8. missing agent: no mood tags, still valid text
c = compose("The moon rose.", undefined, 1, "none");
check("8 no agent", c.performed === "The moon rose." && c.tags.length === 0, c.performed);
// 9. stability snaps to v3 values, lower at peak intensity
check("9 stability snap", snapStability(0.62) === 0.5 && compose("Hi.", hush, 2, "none").settings.stability === 0.5 && compose("Hi.", hush, 0, "none").settings.stability === 1);
// 10. a pause on a line without end punctuation adds a full stop before the tag
c = compose("They walked home", hush, 1, "short");
check("10 punctuation", c.performed.includes("They walked home. [short pause]") && stripTags(c.performed) === "[warmly]".replace(/\[.*\]/, "").trim() + "They walked home.", c.performed);

if (failed) {
  console.error(`${failed} composer test(s) failed`);
  process.exit(1);
}
console.log("composer: all 10 passed");

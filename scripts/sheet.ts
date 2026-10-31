// pnpm sheet [storyId] [--theme day] [--portrait]: render the end of every line into one contact sheet
// (output/sheet/sheet.jpg) plus each line full-size (b000.jpg ...). Local only; needs `pnpm dev` running.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) ?? "golden";
const theme = args.includes("--theme") ? args[args.indexOf("--theme") + 1] : "night";
const portrait = args.includes("--portrait");
const base = process.env.FABLECAST_URL ?? "http://localhost:3000";
const out = new URL("../output/sheet/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: portrait ? { width: 720, height: 960 } : { width: 1280, height: 720 } });
await page.goto(`${base}/render/${id}?theme=${theme}${portrait ? "&portrait=1" : ""}`);
await page.waitForFunction(() => window.__fablecast?.ready, null, { timeout: 30000 });
const ends: number[] = await page.evaluate(() => window.__fablecast!.lineEnds);
const files: string[] = [];
for (let i = 0; i < ends.length; i++) {
  await page.evaluate((t) => window.__fablecast!.renderAt(t), ends[i] - 0.05);
  const f = `b${String(i).padStart(3, "0")}.jpg`;
  await page.locator("#board").screenshot({ path: out + f, type: "jpeg", quality: 80 });
  files.push(f);
}
const cols = 4;
const html = `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px">${files
  .map((f, i) => `<div style="position:relative"><img src="file://${out}${f}" style="width:100%;display:block;border:1px solid #fff"><span style="position:absolute;left:6px;top:4px;color:#fff;font:12px monospace">${i}</span></div>`)
  .join("")}</body></html>`;
writeFileSync(out + "sheet.html", html);
const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await sheet.goto(`file://${out}sheet.html`);
await sheet.screenshot({ path: out + "sheet.jpg", fullPage: true, type: "jpeg", quality: 80 });
await browser.close();
console.log(`contact sheet: ${out}sheet.jpg (${files.length} lines)`);

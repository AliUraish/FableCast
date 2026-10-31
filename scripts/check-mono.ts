// pnpm check:mono — fails on any colour other than black and white (readme 12.7).
// Allowed: #000 #fff #000000 #ffffff, currentColor, transparent, rgba(0,0,0,a), rgba(255,255,255,a), var(--…) tints.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DIRS = ["app", "components", "hooks", "engine", "lib/client"];
const EXT = /\.(css|ts|tsx)$/;
const NAMED = [
  "red", "blue", "green", "yellow", "orange", "purple", "pink", "gray", "grey", "brown", "cyan", "magenta",
  "navy", "teal", "olive", "maroon", "lime", "aqua", "fuchsia", "silver", "gold", "indigo", "violet", "beige",
  "coral", "crimson", "salmon", "tomato", "khaki", "lavender", "plum", "orchid", "tan", "turquoise", "ivory",
];
const ALLOWED_HEX = new Set(["#000", "#fff", "#000000", "#ffffff"]);

function walk(dir: string, out: string[]) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.test(e)) out.push(p);
  }
}

const files: string[] = [];
for (const d of DIRS) walk(join(ROOT, d), files);

const hits: string[] = [];
const named = new RegExp(`\\b(${NAMED.join("|")})\\b`, "i");
// In engine/ the keys `color` and `fill` hold ink TOKENS ("yellow" = thin solid line), not CSS colours,
// so only real canvas style properties are checked there.
const styleProp = new RegExp(
  `(fillStyle|strokeStyle|shadowColor|color|background|backgroundColor|borderColor|fill|stroke)\\s*[:=]\\s*["'\`](${NAMED.join("|")})["'\`]`,
  "i",
);
const canvasProp = new RegExp(`(fillStyle|strokeStyle|shadowColor)\\s*=\\s*["'\`](${NAMED.join("|")})["'\`]`, "i");

for (const f of files) {
  const rel = relative(ROOT, f);
  const isCss = f.endsWith(".css");
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        if (!ALLOWED_HEX.has(m[0].toLowerCase())) hits.push(`${at}  ${m[0]}`);
      }
      for (const m of line.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(([^)]*)\)/gi)) {
        const fn = m[1].toLowerCase();
        const parts = m[2].split(/[\s,/]+/).filter(Boolean);
        const rgb = parts.slice(0, 3).join(",");
        const ok = (fn === "rgb" || fn === "rgba") && (rgb === "0,0,0" || rgb === "255,255,255");
        if (!ok) hits.push(`${at}  ${m[0]}`);
      }
      if (isCss) {
        const decl = line.match(/^\s*[a-z-]+\s*:\s*([^;]*)/i);
        if (decl && !decl[0].trim().startsWith("--font") && named.test(decl[1])) hits.push(`${at}  ${decl[0].trim()}`);
      } else if ((rel.startsWith("engine/") ? canvasProp : styleProp).test(line)) {
        hits.push(`${at}  ${line.trim()}`);
      }
    });
}

if (hits.length) {
  console.error(`check:mono FAIL — ${hits.length} non black-and-white colour(s):`);
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log(`check:mono OK — ${files.length} files, black and white only.`);

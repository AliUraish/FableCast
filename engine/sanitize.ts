// Sanitiser for Claude's pen paths (readme 5, "Sanitising Claude's output").
// Only absolute M L C Q Z, numeric tokens only, coordinates clamped to the 0..100 local box,
// at most 40 segments. Anything else is dropped. A scene must never fail to render.
import { PropPreset, type PenPath, type Prop } from "@/lib/schemas";

const ARGS: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
const MAX_SEGMENTS = 40;
const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

const isCmd = (t: string) => /^[A-Za-z]$/.test(t);
const clamp = (v: number) => Math.min(100, Math.max(0, v));
const fmt = (v: number) => String(Math.round(clamp(v) * 100) / 100);

/** Returns a clean path string, or null when nothing drawable survives. */
export function sanitizePath(d: string): string | null {
  if (typeof d !== "string" || !d) return null;
  const toks = d.slice(0, 2000).match(TOKEN) ?? [];
  const out: string[] = [];
  let i = 0;
  let cmd: string | null = null;
  let hasM = false;
  let segs = 0;
  let drawn = 0;
  while (i < toks.length && segs < MAX_SEGMENTS) {
    const tk = toks[i];
    if (isCmd(tk)) {
      i++;
      // Lowercase (relative) and unknown commands are invalid: their numbers are skipped.
      cmd = ARGS[tk] !== undefined ? tk : null;
      if (cmd === "Z") {
        if (hasM && drawn > 0) {
          out.push("Z");
          segs++;
        }
        cmd = null;
      }
      continue;
    }
    if (!cmd) {
      i++;
      continue;
    }
    const n = ARGS[cmd];
    let avail = 0;
    while (avail < n && i + avail < toks.length && !isCmd(toks[i + avail])) avail++;
    if (avail < n) {
      i += avail; // incomplete argument list: drop it
      continue;
    }
    const vals = toks.slice(i, i + n).map(Number);
    i += n;
    if (vals.some((v) => Number.isNaN(v))) continue;
    const args = vals.map(fmt).join(" ");
    if (cmd === "M") {
      out.push(`M ${args}`);
      hasM = true;
      cmd = "L"; // extra pairs after M are implicit line-tos
    } else {
      if (!hasM) continue;
      out.push(`${cmd} ${args}`);
      segs++;
      drawn++;
    }
  }
  return hasM && drawn > 0 ? out.join(" ") : null;
}

/** Drop invalid custom paths; a prop with nothing drawable falls back to the "rock" preset. */
export function sanitizeProps(props: Prop[]): { props: Prop[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: Prop[] = [];
  for (const prop of props) {
    let custom: PenPath[] | undefined;
    if (prop.custom?.length) {
      custom = prop.custom
        .map((pp) => ({ ...pp, d: sanitizePath(pp.d) }))
        .filter((pp): pp is PenPath => typeof pp.d === "string");
      const dropped = prop.custom.length - custom.length;
      if (dropped) warnings.push(`WARN prop ${prop.id}: dropped ${dropped} invalid custom path(s)`);
    }
    const presetOk = prop.preset !== undefined && PropPreset.safeParse(prop.preset).success;
    // A prop named after a preset ("moon", "star_2", "big_tree") gets that preset rather than a rock.
    const named = PropPreset.options.find((p) => prop.id.toLowerCase().split(/[^a-z]+/).includes(p));
    if (!presetOk && !custom?.length && named) {
      out.push({ ...prop, preset: named, custom: undefined });
      continue;
    }
    if (!presetOk && !custom?.length) {
      warnings.push(`WARN prop ${prop.id}: no valid preset or path, using rock`);
      out.push({ ...prop, preset: "rock", custom: undefined });
      continue;
    }
    out.push({ ...prop, preset: presetOk ? prop.preset : undefined, custom: custom?.length ? custom : undefined });
  }
  return { props: out, warnings };
}

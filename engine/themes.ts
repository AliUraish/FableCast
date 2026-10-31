// Night pages (white ink on black) and Day pages (black ink on white).
// In mono mode a colour token resolves to a LINE STYLE and FILL PATTERN, never a hue (readme 12.4).
// Chalk hues are not implemented: INK_MODE=chalk falls back to mono (see DECISIONS.md).
import type { ColorName } from "@/lib/schemas";
import type { Ctx, InkCtx, ThemeMode } from "./types";

export const fg = (t: ThemeMode) => (t === "night" ? "#fff" : "#000");
export const bg = (t: ThemeMode) => (t === "night" ? "#000" : "#fff");

export interface InkStyle {
  width: number; // multiplier
  dash: number[]; // in units of line width
  double: boolean;
  fill: "none" | "hatch" | "dots" | "cross" | "hlines" | "solid" | "checker";
}

export const INK: Record<ColorName, InkStyle> = {
  white: { width: 1, dash: [], double: false, fill: "none" },
  yellow: { width: 0.7, dash: [], double: false, fill: "none" },
  blue: { width: 1, dash: [3.2, 2.4], double: false, fill: "hatch" },
  orange: { width: 1.6, dash: [], double: false, fill: "dots" },
  pink: { width: 1, dash: [0.01, 2.6], double: false, fill: "cross" },
  green: { width: 1, dash: [7, 2.6], double: false, fill: "hlines" },
  red: { width: 1, dash: [], double: true, fill: "solid" },
  purple: { width: 1, dash: [4.6, 1.8, 0.01, 1.8], double: false, fill: "checker" },
};

export function inkStyle(token: ColorName | undefined): InkStyle {
  return INK[token ?? "white"] ?? INK.white;
}

/** Set stroke state for a token. Returns the style so callers can do the double pass. */
export function applyInk(ctx: Ctx, token: ColorName | undefined, ink: InkCtx, baseWidth = 3): InkStyle {
  const s = inkStyle(token);
  const w = baseWidth * s.width;
  ctx.strokeStyle = fg(ink.theme);
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(s.dash.length ? s.dash.map((d) => d * Math.max(w, 1.5)) : []);
  return s;
}

const patternCache = new Map<string, CanvasPattern | null>();

function makeTile(kind: InkStyle["fill"], color: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const n = 12;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d");
  if (!g) return null;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.2;
  switch (kind) {
    case "hatch":
      g.beginPath(); g.moveTo(0, n); g.lineTo(n, 0); g.moveTo(-n / 2, n / 2); g.lineTo(n / 2, -n / 2);
      g.moveTo(n / 2, n * 1.5); g.lineTo(n * 1.5, n / 2); g.stroke();
      break;
    case "cross":
      g.beginPath(); g.moveTo(0, n); g.lineTo(n, 0); g.moveTo(0, 0); g.lineTo(n, n); g.stroke();
      break;
    case "dots":
      g.beginPath(); g.arc(3, 3, 1.3, 0, Math.PI * 2); g.arc(9, 9, 1.3, 0, Math.PI * 2); g.fill();
      break;
    case "hlines":
      g.fillRect(0, 2, n, 1); g.fillRect(0, 8, n, 1);
      break;
    case "checker":
      for (let y = 0; y < n; y += 3) for (let x = 0; x < n; x += 3) if (((x + y) / 3) % 2 === 0) g.fillRect(x, y, 1.5, 1.5);
      break;
    default:
      return null;
  }
  return c;
}

/** Fill style for a token: a pattern, the solid foreground, or null (outline only). */
export function inkFill(ctx: Ctx, token: ColorName | undefined, ink: InkCtx): CanvasPattern | string | null {
  const s = inkStyle(token);
  if (s.fill === "none") return null;
  if (s.fill === "solid") return fg(ink.theme);
  const key = `${s.fill}:${ink.theme}`;
  if (!patternCache.has(key)) {
    const tile = makeTile(s.fill, fg(ink.theme));
    patternCache.set(key, tile ? ctx.createPattern(tile, "repeat") : null);
  }
  return patternCache.get(key) ?? null;
}

/** Theme at time t: base theme flipped by every lights action at or before t. */
export function themeAt(lights: { t: number; mode: ThemeMode }[], start: ThemeMode, t: number): ThemeMode {
  let mode = start;
  for (const l of lights) if (l.t <= t) mode = l.mode;
  return mode;
}

"use client";
// Dev-only preview of every backdrop and prop preset (used for visual checks with Playwright).
import { useEffect, useRef } from "react";
import { drawBackdrop } from "@/engine/presets/backdrops";
import { drawProp, propRect } from "@/engine/presets/props";
import { sanitizeProps } from "@/engine/sanitize";
import { bg } from "@/engine/themes";
import { LANDSCAPE, PORTRAIT, type Board, type InkCtx, type ThemeMode } from "@/engine/types";
import type { Backdrop, Prop, PropPreset } from "@/lib/schemas";

type Fx = { kind: "wiggle" | "pop" | "glow"; k: number };
type DemoProp = Prop & { effect?: Fx };

const mk = (id: string, preset: PropPreset | undefined, at: [number, number], size: number, extra: Partial<DemoProp> = {}): DemoProp => ({
  id, preset, at, size, tappable: true, reaction: "wiggle", ...extra,
});

const SCENES: { backdrop: Backdrop; props: DemoProp[] }[] = [
  { backdrop: "night_forest", props: [mk("moon", "moon", [0.82, 0.12], 0.16), mk("lantern", "lantern", [0.3, 0.86], 0.14)] },
  { backdrop: "cave", props: [mk("lantern", "lantern", [0.5, 0.86], 0.14), mk("rock", "rock", [0.7, 0.9], 0.1)] },
  { backdrop: "bedroom", props: [mk("bed", "bed", [0.66, 0.82], 0.26), mk("lantern", "lantern", [0.38, 0.88], 0.12)] },
  { backdrop: "meadow", props: [mk("sun", "sun", [0.86, 0.1], 0.16), mk("flower", "flower", [0.3, 0.88], 0.14), mk("tree", "tree", [0.66, 0.7], 0.42)] },
  { backdrop: "seaside", props: [mk("sun", "sun", [0.16, 0.12], 0.14), mk("rock", "rock", [0.6, 0.9], 0.12)] },
  { backdrop: "village", props: [mk("moon", "moon", [0.5, 0.1], 0.14), mk("door", "door", [0.4, 0.78], 0.3)] },
  { backdrop: "sky", props: [mk("star", "star", [0.4, 0.4], 0.12), mk("cloud", "cloud", [0.66, 0.5], 0.14)] },
  { backdrop: "hilltop", props: [mk("moon", "moon", [0.22, 0.14], 0.18), mk("star", "star", [0.6, 0.3], 0.08)] },
];

const PRESETS: PropPreset[] = ["moon", "star", "tree", "house", "cave", "bed", "lantern", "rock", "cloud", "flower", "door", "hill", "box", "bush", "sun", "window", "pumpkin", "bat", "web", "candy", "ghost", "witch_hat"];

function Board_({ board, theme, p, backdrop, props, label }: {
  board: Board; theme: ThemeMode; p: number; backdrop?: Backdrop; props: DemoProp[]; label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = board.w;
    c.height = board.h;
    const ink: InkCtx = { theme, inkMode: "mono" };
    ctx.fillStyle = bg(theme);
    ctx.fillRect(0, 0, board.w, board.h);
    if (backdrop) drawBackdrop(ctx, backdrop, board, p, { ink, seed: backdrop });
    for (const pr of props) drawProp(ctx, pr, board, p, { ink, seed: pr.id, effect: pr.effect });
  }, [board, theme, p, backdrop, props]);
  const scale = board.w > 900 ? 0.5 : board.w > 400 ? 0.45 : 0.6;
  return (
    <figure style={{ margin: 8, display: "inline-block", fontFamily: "monospace", fontSize: 12 }}>
      <canvas ref={ref} style={{ width: board.w * scale, height: board.h * scale, border: "1px solid", display: "block" }} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

const TILE: Board = { w: 300, h: 300, margin: 30, groundY: 280, orientation: "landscape" };

function tileProp(preset: PropPreset, extra: Partial<DemoProp> = {}): DemoProp {
  const base = mk(preset, preset, [0.5, 0.5], 0.6, extra);
  const r = propRect(base, TILE);
  return { ...base, size: r.w > 250 ? 0.6 * (250 / r.w) : 0.6 };
}

export default function SceneryDev() {
  const sanitized = sanitizeProps([
    mk("customOk", undefined, [0.5, 0.5], 0.6, { custom: [{ d: "M 10 90 Q 50 0 90 90 Z" }, { d: "M 30 60 L 70 60" }] }),
    mk("customBad", undefined, [0.5, 0.5], 0.6, { custom: [{ d: "<script>alert(1)</script>" }] }),
  ]);
  return (
    <main style={{ padding: 8 }}>
      <h1 style={{ fontFamily: "monospace", fontSize: 14 }}>BACKDROPS (landscape, night)</h1>
      {SCENES.map((sc) => (
        <Board_ key={sc.backdrop} board={LANDSCAPE} theme="night" p={1} backdrop={sc.backdrop} props={sc.props} label={sc.backdrop} />
      ))}
      <h1 style={{ fontFamily: "monospace", fontSize: 14 }}>VARIANTS</h1>
      <Board_ board={PORTRAIT} theme="night" p={1} backdrop="night_forest" props={[mk("moon", "moon", [0.7, 0.12], 0.12)]} label="portrait night_forest" />
      <Board_ board={PORTRAIT} theme="night" p={1} backdrop="village" props={[]} label="portrait village" />
      <Board_ board={LANDSCAPE} theme="day" p={1} backdrop="meadow" props={SCENES[3].props} label="day meadow" />
      <Board_ board={LANDSCAPE} theme="night" p={0.5} backdrop="night_forest" props={SCENES[0].props} label="night_forest p=0.5" />
      <h1 style={{ fontFamily: "monospace", fontSize: 14 }}>PROPS</h1>
      {PRESETS.map((pr) => (
        <Board_ key={pr} board={TILE} theme="night" p={1} props={[tileProp(pr)]} label={pr} />
      ))}
      <h1 style={{ fontFamily: "monospace", fontSize: 14 }}>EFFECTS + CUSTOM</h1>
      <Board_ board={TILE} theme="night" p={1} props={[tileProp("tree", { effect: { kind: "wiggle", k: 0.08 } })]} label="tree wiggle k=.08" />
      <Board_ board={TILE} theme="night" p={1} props={[tileProp("star", { effect: { kind: "pop", k: 0.5 } })]} label="star pop k=.5" />
      <Board_ board={TILE} theme="night" p={1} props={[tileProp("lantern", { effect: { kind: "glow", k: 0.35 } })]} label="lantern glow k=.35" />
      <Board_ board={TILE} theme="day" p={1} props={[tileProp("house")]} label="house day" />
      <Board_ board={TILE} theme="night" p={1} props={[sanitized.props[0]]} label="custom paths" />
      <Board_ board={TILE} theme="night" p={1} props={[sanitized.props[1]]} label="invalid custom -> rock" />
      <pre style={{ fontFamily: "monospace", fontSize: 12 }}>{sanitized.warnings.join("\n")}</pre>
    </main>
  );
}

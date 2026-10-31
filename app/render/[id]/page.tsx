"use client";
// Canvas-only route used by Playwright scripts (contact sheet, MP4). No chrome, no audio.
// window.__fablecast.renderAt(t) draws the frame at t; the board is a pure function of t.
import { use, useEffect, useRef } from "react";
import type { PreparedStory } from "@/lib/api-types";
import { compile } from "@/engine/timeline";
import { renderAt } from "@/engine/render";
import { LANDSCAPE, PORTRAIT, type ThemeMode } from "@/engine/types";

declare global {
  interface Window {
    __fablecast?: { duration: number; lineEnds: number[]; lineStarts: number[]; renderAt: (t: number) => void; ready: boolean };
  }
}

export default function RenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = new URLSearchParams(location.search);
      const board = q.get("portrait") ? PORTRAIT : LANDSCAPE;
      const theme = (q.get("theme") as ThemeMode) || "night";
      let story: PreparedStory | null = null;
      if (id === "golden") story = (await import("@/data/golden/story.json")).default as unknown as PreparedStory;
      else {
        const raw = sessionStorage.getItem(`fablecast:prepared:${id}`);
        story = raw ? (JSON.parse(raw) as PreparedStory) : null;
      }
      if (!story || cancelled) return;
      const tl = compile(story);
      const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-pixel-square").trim() || "monospace";
      try { await document.fonts.load(`500 48px ${fam}`); } catch {}
      const c = ref.current!;
      c.width = board.w;
      c.height = board.h;
      const ctx = c.getContext("2d")!;
      const draw = (t: number) => renderAt(ctx, tl, t, { board, inkMode: "mono", themeOverride: theme, fonts: { pixel: fam } });
      window.__fablecast = {
        duration: tl.duration,
        lineEnds: tl.lines.map((l) => l.end),
        lineStarts: tl.lines.map((l) => l.start),
        renderAt: draw,
        ready: true,
      };
      draw(Number(q.get("t") ?? 0));
    })();
    return () => { cancelled = true; };
  }, [id]);
  return <canvas ref={ref} id="board" style={{ display: "block" }} />;
}

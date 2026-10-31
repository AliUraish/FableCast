"use client";
// The board: a canvas that shows only the sketches. Each frame calls the engine's pure renderAt(t).
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { renderAt } from "@/engine/render";
import { hitTest } from "@/engine/interact";
import { LANDSCAPE, PORTRAIT, type Board as BoardSpec, type HitRegion, type Reaction, type ThemeMode, type Timeline } from "@/engine/types";
import { INK_MODE } from "@/lib/client/session";

function usePortrait(): boolean {
  const [p, setP] = useState(false);
  useEffect(() => {
    const on = () => setP(window.innerHeight > window.innerWidth && window.innerWidth < 640);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return p;
}

export function pixelFamily(): string {
  if (typeof document === "undefined") return "monospace";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-pixel-square").trim();
  return v || "monospace";
}

export function Board(props: {
  timeline: Timeline;
  tRef: MutableRefObject<number>;
  baseTheme: ThemeMode;
  reactionsRef: MutableRefObject<Reaction[]>;
  onTap: (id: string) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const regionsRef = useRef<HitRegion[]>([]);
  const tlRef = useRef(props.timeline);
  tlRef.current = props.timeline;
  const themeRef = useRef(props.baseTheme);
  themeRef.current = props.baseTheme;
  const portrait = usePortrait();
  const board: BoardSpec = portrait ? PORTRAIT : LANDSCAPE;
  const boardRef = useRef(board);
  boardRef.current = board;
  const [fontsReady, setFontsReady] = useState(false);
  const fontRef = useRef("monospace");

  // Canvas text renders in Geist Pixel only after the font has loaded.
  useEffect(() => {
    const fam = pixelFamily();
    fontRef.current = fam;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setFontsReady(true);
      }
    };
    const timer = window.setTimeout(finish, 1500);
    document.fonts?.load(`500 48px ${fam}`).then(finish, finish);
    return () => window.clearTimeout(timer);
  }, []);

  // Backing store sized to the displayed width × devicePixelRatio.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth || board.w;
      c.width = Math.round(w * dpr);
      c.height = Math.round((w * dpr * board.h) / board.w);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    return () => ro.disconnect();
  }, [board.w, board.h]);

  useEffect(() => {
    if (!fontsReady) return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const b = boardRef.current;
      const scale = c.width / b.w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      try {
        regionsRef.current = renderAt(ctx, tlRef.current, props.tRef.current, {
          board: b,
          inkMode: INK_MODE,
          reducedMotion: reduced,
          themeOverride: themeRef.current,
          reactions: props.reactionsRef.current,
          now: performance.now(),
          fonts: { pixel: fontRef.current },
        });
      } catch (e) {
        // A scene must never fail to render: keep the last frame's regions and move on.
        if (process.env.NODE_ENV !== "production") console.warn("renderAt", e);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fontsReady, props.tRef, props.reactionsRef]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const b = boardRef.current;
    const x = ((e.clientX - r.left) / r.width) * b.w;
    const y = ((e.clientY - r.top) / r.height) * b.h;
    const hit = hitTest(regionsRef.current, x, y);
    if (hit) props.onTap(hit.id);
  };

  return (
    <canvas
      ref={canvasRef}
      className="board-canvas"
      role="img"
      aria-label={props.label}
      style={{ aspectRatio: `${board.w} / ${board.h}` }}
      onPointerDown={onPointerDown}
    />
  );
}

"use client";
// Empty paper with a pen doodle (a moon, drawn stroke by stroke, looping) while page 1 is prepared.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { drawDoodle } from "@/engine/render";
import type { ThemeMode } from "@/engine/types";
import type { StatusLine } from "@/lib/client/loader";
import { INK_MODE } from "@/lib/client/session";
import { fmt } from "./Transport";

export function LoadingBoard(props: {
  theme: ThemeMode;
  status: StatusLine[];
  elapsed: number;
  failed: boolean;
  message?: string | null;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef(props.theme);
  themeRef.current = props.theme;

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round((c.clientWidth || 640) * dpr);
      c.height = Math.round(((c.clientWidth || 640) * dpr * 9) / 16);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const scale = c.width / 1280;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      try {
        drawDoodle(ctx, 1280, 720, { theme: themeRef.current, inkMode: INK_MODE, reducedMotion: reduced }, (now - t0) / 1000);
      } catch {}
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="loading">
      <div className="board-wrap">
        <canvas ref={ref} className="board-canvas" style={{ aspectRatio: "16 / 9", cursor: "default" }} role="img" aria-label="A pen doodles a moon while the story is prepared" />
      </div>
      {props.failed ? (
        <>
          <p className="serif-title" style={{ margin: 0 }}>The pen ran dry. Let&apos;s play a ready story.</p>
          {props.message && <p className="mono dim" style={{ margin: 0 }}>{props.message}</p>}
          <Link href="/story/golden" className="btn btn-primary">Play a ready story</Link>
        </>
      ) : (
        <>
          <div className="row between">
            <h1 className="pixel-display" style={{ margin: 0 }}>DRAWING PAGE 1</h1>
            <span className="pixel-label" aria-label="Elapsed">{fmt(props.elapsed)}</span>
          </div>
          <ul className="status-lines" aria-live="polite">
            {props.status.map((s) => (
              <li key={s.key} className={s.state === "pending" ? "dim" : undefined}>
                {s.label} ... {s.state === "ok" ? "OK" : s.state === "fail" ? "FAIL" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

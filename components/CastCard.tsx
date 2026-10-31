"use client";
import { useEffect, useRef, useState } from "react";
import { drawPortrait } from "@/engine/render";
import type { CharacterSkin } from "@/lib/schemas";
import type { ThemeMode } from "@/engine/types";
import { INK_MODE } from "@/lib/client/session";
import { PixelIcon } from "./PixelIcon";

export type CardState = "OFFSTAGE" | "ON STAGE" | "SPEAKING" | "NARRATOR";

const W = 112;
const H = 96;

function Portrait({ skin, theme, onStage }: { skin: CharacterSkin; theme: ThemeMode; onStage: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const enteredAt = useRef<number | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // The portrait is pen-drawn on at the moment the character enters the board.
  useEffect(() => {
    enteredAt.current = onStage ? performance.now() : null;
  }, [onStage]);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const draw = enteredAt.current === null ? 1 : Math.min(1, (now - enteredAt.current) / 1200);
      try {
        drawPortrait(ctx, skin, W, H, { theme: themeRef.current, inkMode: INK_MODE, reducedMotion: reduced }, draw, (now - t0) / 1000);
      } catch {}
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [skin]);

  return <canvas ref={ref} width={W} height={H} aria-hidden />;
}

export function CastCard(props: {
  id: string;
  name: string;
  skin: CharacterSkin | null; // null = narrator
  state: CardState;
  speaking: boolean;
  voice: string | null;
  expression: string | null;
  pageTheme: ThemeMode;
  onTap: (id: string) => void;
}) {
  const [flash, setFlash] = useState(false);
  const inverted = props.speaking || flash;
  const inkTheme: ThemeMode = inverted ? (props.pageTheme === "night" ? "day" : "night") : props.pageTheme;
  const cls = ["card", props.state === "OFFSTAGE" && !inverted ? "card-off" : "", props.speaking ? "card-speaking" : "", flash ? "card-flash" : ""]
    .filter(Boolean)
    .join(" ");

  const tap = () => {
    props.onTap(props.id);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 300);
  };

  return (
    <button
      type="button"
      className={cls}
      onClick={tap}
      aria-label={`${props.name}, ${props.speaking ? "speaking" : props.state.toLowerCase()}. Tap to make them react.`}
    >
      {props.skin ? (
        <Portrait skin={props.skin} theme={inkTheme} onStage={props.state !== "OFFSTAGE"} />
      ) : (
        <span style={{ width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PixelIcon name="book" size={48} />
        </span>
      )}
      <span className="name mono">{props.name}</span>
      <span className="mono" style={{ display: "flex", alignItems: "center" }}>
        {props.speaking ? "SPEAKING" : props.state}
        {props.speaking && (
          <span className="bars" aria-hidden>
            <i />
            <i />
          </span>
        )}
      </span>
      {props.speaking && props.voice && <span className="mono">VOICE: {props.voice}</span>}
      {!props.speaking && props.expression && props.state === "ON STAGE" && <span className="mono">{props.expression}</span>}
    </button>
  );
}

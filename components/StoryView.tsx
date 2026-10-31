"use client";
// Story mode: top bar, board, transport, caption bar, cast strip, Director's View.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compile } from "@/engine/timeline";
import { liveReactions, reactionFor } from "@/engine/interact";
import type { Reaction, Timeline } from "@/engine/types";
import type { PreparedStory } from "@/lib/api-types";
import { useStory } from "@/lib/client/loader";
import { usePlayback } from "@/hooks/usePlayback";
import { usePersistedBool } from "@/hooks/usePersisted";
import { useTheme } from "@/hooks/useTheme";
import { Board } from "./Board";
import { CaptionBar, speakerName } from "./CaptionBar";
import { CastStrip } from "./CastStrip";
import { DirectorDrawer } from "./DirectorDrawer";
import { EndOverlay } from "./EndOverlay";
import { LoadingBoard } from "./LoadingBoard";
import { TopBar } from "./TopBar";
import { Transport } from "./Transport";

function safeCompile(p: PreparedStory | null): { tl: Timeline | null; err: string | null } {
  if (!p || !p.scenes[0]) return { tl: null, err: null };
  try {
    const tl = compile(p);
    return { tl: tl.scenes.length ? tl : null, err: null };
  } catch (e) {
    return { tl: null, err: (e as Error).message };
  }
}

export function StoryView({ id }: { id: string }) {
  const load = useStory(id);
  const [baseTheme, setBaseTheme] = useTheme();
  const [captionsOn, setCaptionsOn] = usePersistedBool("fablecast:cc", true);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const { tl, err } = useMemo(() => safeCompile(load.prepared), [load.prepared]);
  const pb = usePlayback(tl, baseTheme, muted);
  const reactionsRef = useRef<Reaction[]>([]);
  const autoStarted = useRef(false);

  // Start as soon as page 1 is ready.
  useEffect(() => {
    if (tl && !autoStarted.current) {
      autoStarted.current = true;
      pb.play();
    }
  }, [tl, pb]);

  const react = useCallback(
    (target: string) => {
      if (!tl) return;
      const now = performance.now();
      try {
        const r = reactionFor(tl, target, now);
        reactionsRef.current = [...liveReactions(reactionsRef.current, now), ...(r ? [r] : [])];
      } catch {}
    },
    [tl],
  );

  // Keyboard: Space play/pause, C captions, D director, M mute, arrows ±5 s.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        if (!(el.tagName === "INPUT" && (el as HTMLInputElement).type === "range" && e.key === " ")) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.key === " ") {
        if (el && el.tagName === "BUTTON") return; // let buttons handle Space themselves
        e.preventDefault();
        pb.toggle();
      } else if (k === "c") setCaptionsOn(!captionsOn);
      else if (k === "d") setDirectorOpen((v) => !v);
      else if (k === "m") setMuted((v) => !v);
      else if (e.key === "ArrowLeft" && !pb.live) {
        // Seeking unlocks only after the story has been told once (it plays live).
        e.preventDefault();
        pb.seek(pb.tRef.current - 5);
      } else if (e.key === "ArrowRight" && !pb.live) {
        e.preventDefault();
        pb.seek(pb.tRef.current + 5);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [pb, captionsOn, setCaptionsOn]);

  const state = pb.state;
  const pageTheme = state?.theme ?? baseTheme;
  const title = load.prepared?.bible.title ?? "Fablecast";
  const pageScene = tl?.scenes[state?.page ?? 0];
  const captionText = state?.activeLine?.text ?? "";

  const top = (
    <TopBar
      title={title}
      captionsOn={captionsOn}
      onCaptions={() => setCaptionsOn(!captionsOn)}
      directorOpen={directorOpen}
      onDirector={() => setDirectorOpen((v) => !v)}
      theme={baseTheme}
      onTheme={() => setBaseTheme(baseTheme === "night" ? "day" : "night")}
      muted={muted}
      onMute={() => setMuted((v) => !v)}
    />
  );

  if (!tl || !load.prepared) {
    const failed = !!load.error || load.timedOut || !!err;
    return (
      <div className="story" data-theme={baseTheme}>
        {top}
        <main className="story-col">
          <LoadingBoard
            theme={baseTheme}
            status={load.status}
            elapsed={load.elapsed}
            failed={failed}
            message={load.error ?? err ?? (load.timedOut ? "Page 1 took too long." : null)}
          />
        </main>
      </div>
    );
  }

  const pages = load.prepared.scenes.length;
  // Live progress through the pages (no total time is shown until the story has ended).
  const pageIdx = state?.page ?? 0;
  const sc = tl.scenes[pageIdx];
  const frac = sc ? Math.max(0, Math.min(1, (pb.t - sc.start) / Math.max(0.01, sc.end - sc.start))) : 0;
  const progress = state?.ended ? 1 : (pageIdx + frac) / Math.max(1, pages);

  return (
    <div className="story" data-theme={pageTheme}>
      {top}
      <main className="story-col">
        <div className="board-wrap">
          <Board
            timeline={tl}
            tRef={pb.tRef}
            baseTheme={baseTheme}
            reactionsRef={reactionsRef}
            onTap={react}
            label={pageScene ? `Page ${pageScene.index + 1}: ${pageScene.summary}` : title}
          />
          {pb.needsTap ? (
            <div className="board-overlay center">
              <button type="button" className="btn-primary tap-start" onClick={pb.unlock} autoFocus>
                TAP TO START
              </button>
            </div>
          ) : pb.waiting ? (
            <div className="board-overlay">
              <span className="shimmer mono">TURNING THE PAGE</span>
            </div>
          ) : pb.buffering && pb.playing ? (
            <div className="board-overlay">
              <span className="shimmer mono">LOADING THE VOICE</span>
            </div>
          ) : null}
        </div>
        {state?.ended && <EndOverlay onAgain={pb.restart} />}
        <Transport
          t={pb.t}
          duration={pb.duration}
          playing={pb.playing}
          live={pb.live}
          progress={progress}
          page={state?.page ?? 0}
          pages={pages}
          onToggle={pb.toggle}
          onSeek={pb.seek}
          onRestart={pb.restart}
        />
        {captionsOn && (
          <CaptionBar
            line={state?.activeLine ?? null}
            wordIndex={state?.activeWordIndex ?? -1}
            speaker={speakerName(tl, state?.activeLine ?? null)}
          />
        )}
        <CastStrip timeline={tl} state={state} pageTheme={pageTheme} onTap={react} />
      </main>
      {directorOpen && (
        <DirectorDrawer
          timeline={tl}
          prepared={load.prepared}
          state={state}
          theme={pageTheme}
          onSeek={pb.seek}
          live={pb.live}
          t={pb.t}
          onClose={() => setDirectorOpen(false)}
          extraWarnings={load.storyWarnings}
        />
      )}
      <div className="sr-only" aria-live="polite">{captionText}</div>
    </div>
  );
}

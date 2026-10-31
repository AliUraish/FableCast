"use client";
// The single clock (readme 12.5). Inside a scene with a voice take, the clock IS that scene's <audio>
// element: t = audioStart + audio.currentTime, so the sketches never run ahead of (or behind) the voice.
// If the take is not ready yet, or is buffering, t holds until it can play. Between takes (page leads,
// tails, silent dev/mock scenes) it runs on wall time. There is no browser-voice fallback.
// The story plays LIVE: no seeking until it has ended once; then scrub, restart and AGAIN unlock.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { stateAt, type PlaybackState } from "@/engine/state";
import type { ThemeMode, TLScene, Timeline } from "@/engine/types";

export interface Playback {
  t: number;
  tRef: MutableRefObject<number>;
  playing: boolean;
  waiting: boolean; // holding at the end of the compiled timeline for the next page
  buffering: boolean; // holding for the voice take to load
  needsTap: boolean; // the browser blocked autoplay: a tap must start the voice
  live: boolean; // true until the story has ended once (no seeking while live)
  duration: number;
  state: PlaybackState | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void; // ignored while live
  restart: () => void; // ignored while live
  unlock: () => void; // call from a tap: unlocks audio playback and starts
}

const HAVE_FUTURE_DATA = 3;

function sceneAt(tl: Timeline, t: number): TLScene | null {
  for (const s of tl.scenes) if (t >= s.start && t < s.end) return s;
  return null;
}

function safeState(tl: Timeline | null, t: number, base: ThemeMode): PlaybackState | null {
  if (!tl) return null;
  try {
    return stateAt(tl, t, base);
  } catch {
    return null;
  }
}

export function usePlayback(tl: Timeline | null, baseTheme: ThemeMode, muted: boolean): Playback {
  const tRef = useRef(0);
  const tlRef = useRef(tl);
  tlRef.current = tl;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const playingRef = useRef(false);
  const waitingRef = useRef(false);
  const bufferingRef = useRef(false);
  const unlockedRef = useRef(false); // seeking allowed (the story has ended once)
  const lastWall = useRef<number | null>(null);
  const lastSet = useRef(-1);
  const audios = useRef(new Map<number, HTMLAudioElement>());
  const starting = useRef(new Set<number>());
  const retryAt = useRef(new Map<number, number>());
  const storyId = useRef<string | null>(null);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [live, setLive] = useState(true);

  const releaseAll = useCallback(() => {
    for (const a of audios.current.values()) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    audios.current.clear();
    starting.current.clear();
    retryAt.current.clear();
  }, []);

  // A new story: start over, live again.
  useEffect(() => {
    const id = tl?.storyId ?? null;
    if (id === storyId.current) return;
    if (storyId.current !== null) {
      releaseAll();
      tRef.current = 0;
      lastSet.current = -1;
      setT(0);
      unlockedRef.current = false;
      setLive(true);
    }
    storyId.current = id;
  }, [tl?.storyId, releaseAll]);

  // Preload one <audio> per scene take as soon as the scene arrives.
  useEffect(() => {
    if (!tl) return;
    for (const s of tl.scenes) {
      if (!s.audioSrc || audios.current.has(s.index)) continue;
      const a = new Audio();
      a.preload = "auto";
      a.src = s.audioSrc;
      a.muted = mutedRef.current;
      a.load();
      audios.current.set(s.index, a);
    }
  }, [tl]);

  useEffect(() => {
    for (const a of audios.current.values()) a.muted = muted;
  }, [muted]);

  const pauseAll = useCallback(() => {
    for (const a of audios.current.values()) if (!a.paused) a.pause();
  }, []);

  const startAudio = useCallback((sc: TLScene, a: HTMLAudioElement, want: number) => {
    if (starting.current.has(sc.index)) return;
    if (Math.abs(a.currentTime - want) > 0.08) a.currentTime = want;
    starting.current.add(sc.index);
    a.play()
      .then(() => setNeedsTap(false))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "NotAllowedError") {
          // Autoplay blocked: hold until a tap (unlock).
          playingRef.current = false;
          setPlaying(false);
          setNeedsTap(true);
        } else {
          retryAt.current.set(sc.index, performance.now() + 1000);
        }
      })
      .finally(() => starting.current.delete(sc.index));
  }, []);

  // The frame loop.
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const tl = tlRef.current;
      const prev = lastWall.current ?? now;
      lastWall.current = now;
      if (!tl) return;
      let tt = tRef.current;
      let hold = false;

      if (playingRef.current) {
        const dt = Math.min(0.1, Math.max(0, (now - prev) / 1000));
        const sc = sceneAt(tl, tt);
        const audio = sc && sc.audioSrc ? audios.current.get(sc.index) : undefined;
        const winEnd = sc ? sc.audioStart + sc.audioDuration : 0;
        const inWin = !!(sc && audio && tt >= sc.audioStart - 1e-6 && tt < winEnd - 0.02);

        for (const [i, a] of audios.current) if ((!inWin || i !== sc!.index) && !a.paused) a.pause();

        if (inWin && sc && audio) {
          if (audio.ended) {
            tt += dt; // take shorter than planned: wall time finishes the window
          } else if (!audio.paused) {
            if (!audio.seeking) tt = Math.max(tt, sc.audioStart + audio.currentTime);
            hold = audio.readyState < HAVE_FUTURE_DATA; // buffering mid-take: currentTime stops, so does t
          } else {
            // Not playing yet: hold t until the take can play, then start it exactly at t.
            hold = true;
            const wait = retryAt.current.get(sc.index) ?? 0;
            if (audio.error && now > wait) {
              retryAt.current.set(sc.index, now + 3000);
              audio.load();
            } else if (audio.readyState >= HAVE_FUTURE_DATA && now >= wait) {
              startAudio(sc, audio, tt - sc.audioStart);
            } else if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
              audio.load();
            }
          }
        } else {
          // Wall time, but never step past the start of a take: the voice must lead the drawing.
          let next = tt + dt;
          for (const s of tl.scenes) {
            if (s.audioSrc && audios.current.has(s.index) && tt < s.audioStart && next >= s.audioStart) {
              next = s.audioStart;
              break;
            }
          }
          tt = next;
        }

        if (tt >= tl.duration) {
          tt = tl.duration;
          if (tl.complete) {
            playingRef.current = false;
            setPlaying(false);
            pauseAll();
            if (!unlockedRef.current) {
              unlockedRef.current = true;
              setLive(false);
            }
          } else if (!waitingRef.current) {
            waitingRef.current = true;
            setWaiting(true);
          }
        } else if (waitingRef.current) {
          waitingRef.current = false;
          setWaiting(false);
        }
        tRef.current = tt;
      }

      if (hold !== bufferingRef.current) {
        bufferingRef.current = hold;
        setBuffering(hold);
      }
      if (Math.abs(tt - lastSet.current) > 0.04) {
        lastSet.current = tt;
        setT(tt);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pauseAll, startAudio]);

  // Release audio on unmount.
  useEffect(() => releaseAll, [releaseAll]);

  const jump = useCallback(
    (x: number) => {
      const d = tlRef.current?.duration ?? 0;
      const v = Math.max(0, Math.min(d, x));
      tRef.current = v;
      lastSet.current = v;
      setT(v);
      pauseAll();
      // A finished take stays `ended` until its position changes; rewind it so it can start again.
      for (const a of audios.current.values()) if (a.ended) a.currentTime = 0;
    },
    [pauseAll],
  );

  const seek = useCallback((x: number) => {
    if (unlockedRef.current) jump(x);
  }, [jump]);

  const play = useCallback(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (tl.complete && tRef.current >= tl.duration - 0.01) jump(0);
    lastWall.current = null;
    playingRef.current = true;
    setPlaying(true);
  }, [jump]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    pauseAll();
  }, [pauseAll]);

  const toggle = useCallback(() => (playingRef.current ? pause() : play()), [play, pause]);

  const restart = useCallback(() => {
    if (!unlockedRef.current) return;
    jump(0);
    play();
  }, [jump, play]);

  // From a user gesture: start the current take right here (so the browser allows sound) and prime the
  // other takes muted, so later pages may start on their own.
  const unlock = useCallback(() => {
    const tl = tlRef.current;
    const tt = tRef.current;
    const sc = tl ? sceneAt(tl, tt) : null;
    for (const [i, a] of audios.current) {
      if (sc && i === sc.index && tt >= sc.audioStart) {
        const want = tt - sc.audioStart;
        if (Math.abs(a.currentTime - want) > 0.08) a.currentTime = want;
        a.play().catch(() => {});
      } else {
        a.muted = true;
        a.play()
          .then(() => {
            a.pause();
            a.currentTime = 0;
          })
          .catch(() => {})
          .finally(() => {
            a.muted = mutedRef.current;
          });
      }
    }
    setNeedsTap(false);
    play();
  }, [play]);

  const state = useMemo(() => safeState(tl, t, baseTheme), [tl, t, baseTheme]);

  return {
    t, tRef, playing, waiting, buffering, needsTap, live, duration: tl?.duration ?? 0, state,
    play, pause, toggle, seek, restart, unlock,
  };
}

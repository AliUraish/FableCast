"use client";
import { PixelIcon } from "./PixelIcon";

export const fmt = (s: number) => {
  const v = Math.max(0, Math.floor(s));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/**
 * While the story is LIVE (first telling) there is no scrubbing: a progress line, elapsed time and
 * `LIVE`, no restart. Once it has ended, the full scrub bar, total time and restart unlock.
 */
export function Transport(props: {
  t: number;
  duration: number;
  playing: boolean;
  live: boolean;
  progress: number; // 0..1 through the pages (live mode only; reveals no total time)
  page: number;
  pages: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onRestart: () => void;
}) {
  return (
    <div className="transport">
      <button type="button" className="play" onClick={props.onToggle} aria-label={props.playing ? "Pause" : "Play"} title="Play or pause (Space)">
        <PixelIcon name={props.playing ? "pause" : "play"} size={16} />
      </button>
      {props.live ? (
        <div className="progress-line" role="progressbar" aria-label="Story progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.progress * 100)}>
          <span style={{ width: `${Math.round(Math.max(0, Math.min(1, props.progress)) * 1000) / 10}%` }} />
        </div>
      ) : (
        <input
          className="scrub"
          type="range"
          min={0}
          max={Math.max(0.01, props.duration)}
          step={0.05}
          value={Math.min(props.t, props.duration)}
          onChange={(e) => props.onSeek(Number(e.target.value))}
          aria-label="Scrub"
          aria-valuetext={`${fmt(props.t)} of ${fmt(props.duration)}`}
        />
      )}
      <span className="mono times">
        {props.live ? `${fmt(props.t)} · LIVE` : `${fmt(props.t)} / ${fmt(props.duration)}`}
      </span>
      <span className="mono page">
        PAGE {Math.min(props.page + 1, Math.max(1, props.pages))}/{props.pages}
      </span>
      {!props.live && (
        <button type="button" className="play" onClick={props.onRestart} aria-label="Restart" title="Restart">
          <PixelIcon name="restart" size={16} />
        </button>
      )}
    </div>
  );
}

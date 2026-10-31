"use client";
import Link from "next/link";
import type { ThemeMode } from "@/engine/types";
import { PixelIcon } from "./PixelIcon";

export function TopBar(props: {
  title: string;
  captionsOn: boolean;
  onCaptions: () => void;
  directorOpen: boolean;
  onDirector: () => void;
  theme: ThemeMode;
  onTheme: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  return (
    <header className="topbar">
      <Link href="/" className="btn mono" aria-label="New story">
        <PixelIcon name="back" size={10} /> NEW
      </Link>
      <div className="topbar-title" title={props.title}>{props.title}</div>
      <div className="topbar-actions">
        <button type="button" aria-pressed={props.captionsOn} onClick={props.onCaptions} title="Captions (C)">CC</button>
        <button type="button" aria-pressed={props.directorOpen} onClick={props.onDirector} title="Director's View (D)">DIR</button>
        <button type="button" aria-pressed={props.theme === "night"} onClick={props.onTheme} title="Night or Day pages">
          {props.theme === "night" ? "NIGHT" : "DAY"}
        </button>
        <button type="button" aria-pressed={props.muted} onClick={props.onMute} aria-label={props.muted ? "Unmute" : "Mute"} title="Mute (M)">
          <PixelIcon name={props.muted ? "mute" : "sound"} size={14} />
        </button>
      </div>
    </header>
  );
}

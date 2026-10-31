"use client";
import Link from "next/link";
import { PixelIcon } from "./PixelIcon";

/** Shown under the board only once the story has ended (the engine draws THE END on the board).
 *  The story plays live first; rewinding is offered here, at the end. */
export function EndOverlay({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="end-row">
      <button type="button" onClick={onAgain} aria-label="Rewind to the start">
        <PixelIcon name="restart" size={14} /> REWIND
      </button>
      <Link href="/" className="btn">NEW STORY</Link>
    </div>
  );
}

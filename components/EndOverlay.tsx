"use client";
import Link from "next/link";

/** Shown under the board after the last line (the engine draws THE END on the board). */
export function EndOverlay({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="end-row">
      <button type="button" onClick={onAgain}>AGAIN</button>
      <Link href="/" className="btn">NEW STORY</Link>
    </div>
  );
}

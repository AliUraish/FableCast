"use client";
// Captions live outside the board: spoken words full, upcoming 35%, current word inverted.
import { Fragment, useEffect, useRef, useState } from "react";
import { wrapWords } from "@/engine/captions";
import type { TLLine } from "@/engine/types";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

export function CaptionBar({ line, wordIndex }: { line: TLLine | null; wordIndex: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [maxChars, setMaxChars] = useState(48);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 24;
      setMaxChars(Math.max(16, Math.floor((el.clientWidth - 16) / (fs * 0.5))));
    };
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const words = line?.words.map((w) => w.text) ?? [];
  let rows: string[][] = [];
  try {
    rows = wrapWords(words, maxChars, 2);
  } catch {
    rows = [];
  }
  if (!rows.length && words.length) rows = [words];
  const key = line && line.decision.emphasis && !line.focus && line.keyword ? norm(line.keyword) : null;

  let i = 0;
  return (
    <div ref={ref} className="captionbar serif-caption" aria-hidden>
      {line &&
        rows.map((row, r) => (
          <span className="caption-line" key={`${line.global}-${r}`}>
            {row.map((w) => {
              const idx = i++;
              const cls =
                idx === wordIndex ? "w w-now" : idx < wordIndex ? "w w-spoken" : "w w-next";
              const k = key && norm(w) === key ? " w-key" : "";
              return (
                <Fragment key={idx}>
                  <span className={cls + k}>{w}</span>{" "}
                </Fragment>
              );
            })}
          </span>
        ))}
    </div>
  );
}

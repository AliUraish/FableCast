// Caption helpers shared by the DOM caption bar and MP4 export.
import type { TLLine } from "./types";

/** Index of the word being spoken at t (-1 before the first word; last index after the line). */
export function activeWordAt(line: TLLine, t: number): number {
  let idx = -1;
  for (let i = 0; i < line.words.length; i++) {
    if (line.words[i].start <= t) idx = i;
    else break;
  }
  return idx;
}

/** Wrap words into at most `maxLines` lines of about `maxChars` characters (overflow joins the last line). */
export function wrapWords(words: string[], maxChars: number, maxLines = 2): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const w of words) {
    const add = (cur.length ? 1 : 0) + w.length;
    if (cur.length && len + add > maxChars && lines.length < maxLines - 1) {
      lines.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += (cur.length > 1 ? 1 : 0) + w.length;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

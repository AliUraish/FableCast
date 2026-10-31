// Deterministic layout checks (readme 6.11). Every problem is a WARN; tests fail on any WARN.
// Compile-time auto-corrections (unknown ids, auto-enters, conflicts) are logged by timeline.ts.
import { characterAt, charHeight } from "./tracks";
import { LANDSCAPE, toBoard, type Timeline } from "./types";

export const CAPTION_CHARS_PER_LINE = 52;

export function lint(tl: Timeline): string[] {
  const out: string[] = [];
  const board = LANDSCAPE;
  for (const scene of tl.scenes) {
    const W = (msg: string) => out.push(`WARN page ${scene.index + 1}: ${msg}`);
    const sceneLines = tl.lines.filter((l) => l.scene === scene.index);
    const sceneActs = tl.actions.filter((a) => a.scene === scene.index);

    // Props off the board.
    for (const p of scene.props) {
      const [cx, cy] = toBoard(board, p.at);
      const h = p.size * board.h;
      if (cx - h / 2 < -h * 0.2 || cx + h / 2 > board.w + h * 0.2 || cy - h / 2 < -h * 0.2 || cy + h / 2 > board.h + h * 0.2) {
        W(`prop "${p.id}" sits off the board`);
      }
    }

    for (const ln of sceneLines) {
      // Captions must fit two lines.
      if (ln.text.length > CAPTION_CHARS_PER_LINE * 2) W(`line ${ln.index + 1} caption is too long for two lines`);
      // Dead air: every line must change something visible.
      const changes = sceneActs.some((a) => a.line === ln.index) || tl.emphasis.some((e) => e.scene === scene.index && e.line === ln.index);
      if (!changes) W(`line ${ln.index + 1} changes nothing on the page (dead air)`);
      if (ln.keyword && ln.keywordTime === undefined) W(`line ${ln.index + 1} keyword "${ln.keyword}" is not in the text`);
    }

    // Characters overlapping heavily at the end of each line.
    const seen = new Set<string>();
    for (const ln of sceneLines) {
      const t = ln.end;
      const live = tl.characters
        .map((c) => ({ c, tr: characterAt(tl, scene, c, t, board) }))
        .filter((x) => x.tr && x.tr.moving === 0);
      for (let a = 0; a < live.length; a++) {
        for (let b = a + 1; b < live.length; b++) {
          const A = live[a], B = live[b];
          const minGap = 0.42 * Math.min(charHeight(board, A.c), charHeight(board, B.c));
          const key = `${A.c.id}|${B.c.id}`;
          if (Math.abs(A.tr!.x - B.tr!.x) < minGap && !seen.has(key)) {
            seen.add(key);
            W(`${A.c.id} and ${B.c.id} overlap at line ${ln.index + 1}`);
          }
        }
      }
    }
  }
  return out;
}

// Hit-testing and tap reactions. Reactions live on wall-clock time and never alter the timeline.
import type { HitRegion, Reaction, Timeline } from "./types";

export const REACTION_MS = 1000;

export function hitTest(regions: HitRegion[], x: number, y: number): HitRegion | null {
  const pad = 10;
  const inside = (r: HitRegion) => x >= r.rect.x - pad && x <= r.rect.x + r.rect.w + pad && y >= r.rect.y - pad && y <= r.rect.y + r.rect.h + pad;
  // Characters win over props; later-drawn (top-most) wins within a kind.
  for (let i = regions.length - 1; i >= 0; i--) if (regions[i].kind === "character" && inside(regions[i])) return regions[i];
  for (let i = regions.length - 1; i >= 0; i--) if (regions[i].kind === "prop" && inside(regions[i])) return regions[i];
  return null;
}

/** Reaction for a tapped character or prop id (characters jump; props use their configured reaction). */
export function reactionFor(tl: Timeline, id: string, now: number): Reaction | null {
  if (tl.characters.some((c) => c.id === id)) return { target: id, kind: "jump", startedAt: now };
  for (const s of tl.scenes) {
    const p = s.props.find((pp) => pp.id === id);
    if (p) return p.tappable === false ? null : { target: id, kind: p.reaction ?? "wiggle", startedAt: now };
  }
  return null;
}

export function liveReactions(rs: Reaction[], now: number): Reaction[] {
  return rs.filter((r) => now - r.startedAt < REACTION_MS + 100);
}

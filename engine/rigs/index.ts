// Character rigs: the only public entry points the renderer and cast strip use.
import type { CharacterSkin } from "@/lib/schemas";
import type { CharDrawOpts, CharPose, Ctx, Rect } from "../types";
import { computeMotion, drawBiped } from "./biped";
import { drawBlob } from "./blob";

const STILL: CharDrawOpts = { ink: { theme: "night", inkMode: "mono", reducedMotion: true }, seed: "", wobble: 0 };

/** Draw a character at its pose. Returns its bounding rect in board px. */
export function drawCharacter(ctx: Ctx, skin: CharacterSkin, pose: CharPose, o: CharDrawOpts): Rect {
  if (pose.draw > 0) {
    ctx.save();
    try {
      if (skin.rig === "blob") drawBlob(ctx, skin, pose, o);
      else drawBiped(ctx, skin, pose, o);
    } finally {
      ctx.restore();
    }
  }
  return characterRect(skin, pose);
}

/** Bounding rect (board px) without drawing: hit-testing and lint. Follows jumps and crouches. */
export function characterRect(skin: CharacterSkin, pose: CharPose): Rect {
  const H = pose.height;
  const u = H / 100;
  const m = computeMotion(skin, pose, STILL, u, skin.rig === "blob");
  const blob = skin.rig === "blob";
  const w = (blob ? 0.86 : 0.62) * H * Math.max(0.3, Math.abs(m.sx));
  const tall = skin.features.accessory === "hat" ? 1.2 : skin.features.ears === "long" ? 1.12 : 1.04;
  const h = H * tall * m.sy;
  return { x: pose.x + m.dx - w / 2, y: pose.y + m.dy - h, w, h };
}

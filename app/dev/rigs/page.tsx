"use client";
// Dev-only contact sheet for the character rigs: skins, expressions, gestures, walk, sketch-on.
import { useEffect, useRef } from "react";
import { drawCharacter } from "@/engine/rigs";
import { bg, fg } from "@/engine/themes";
import type { CharPose, ThemeMode } from "@/engine/types";
import type { CharacterSkin, ColorName, Expression, GestureKind } from "@/lib/schemas";

type Features = CharacterSkin["features"];
const NONE: Features = { ears: "none", tail: "none", horns: false, wings: false, spikes: false, eyes: "dots", accessory: "none" };
function skin(id: string, rig: "biped" | "blob", f: Partial<Features>, body: ColorName, accent: ColorName, outline: ColorName = "white"): CharacterSkin {
  return { id, name: id, rig, palette: { body, accent, outline }, features: { ...NONE, ...f }, scale: 1 };
}

const dragon = skin("dragon", "biped", { horns: true, wings: true, spikes: true, tail: "long", eyes: "round" }, "blue", "orange");
const bunny = skin("bunny", "biped", { ears: "long", tail: "fluffy", accessory: "scarf" }, "white", "pink");
const cat = skin("cat", "biped", { ears: "pointy", tail: "long", accessory: "glasses" }, "green", "yellow");
const bear = skin("bear", "biped", { ears: "round", tail: "short", accessory: "hat" }, "orange", "purple");
const ghost = skin("ghost", "blob", { eyes: "round" }, "white", "yellow");
const slime = skin("slime", "blob", { ears: "round", spikes: true }, "purple", "blue", "blue");
const owl = skin("owl", "blob", { wings: true, ears: "pointy", eyes: "round", accessory: "glasses" }, "pink", "green");
const imp = skin("imp", "blob", { horns: true, tail: "long", accessory: "cape" }, "red", "orange", "green");

interface Cell { s: CharacterSkin; label: string; pose?: Partial<CharPose> }
const EXPR: Expression[] = ["neutral", "happy", "curious", "worried", "scared", "sleepy", "proud"];
const GEST: GestureKind[] = ["wave", "point", "jump", "shrug", "hug", "hide", "peek", "spin", "sleep", "shiver"];

// Species features: snout, beak, button nose, whiskers.
const bearS = skin("bear_s", "biped", { ears: "round", tail: "short", nose: "snout" }, "orange", "purple");
const owlS = skin("owl_s", "biped", { wings: true, ears: "pointy", eyes: "round", nose: "beak" }, "white", "yellow");
const bunnyS = skin("bunny_s", "biped", { ears: "long", tail: "fluffy", nose: "button", whiskers: true }, "white", "pink");
const foxS = skin("fox_s", "biped", { ears: "pointy", tail: "fluffy", nose: "snout", whiskers: true }, "green", "orange");
const penguinS = skin("penguin_s", "blob", { wings: true, nose: "beak", eyes: "round" }, "white", "yellow");
const mouseS = skin("mouse_s", "blob", { ears: "round", nose: "button", whiskers: true, tail: "long" }, "white", "pink");

const ROWS: { theme: ThemeMode; cells: Cell[] }[] = [
  {
    theme: "night",
    cells: [
      { s: bearS, label: "bear snout", pose: {} },
      { s: owlS, label: "owl beak", pose: { expression: "happy" as Expression } },
      { s: bunnyS, label: "bunny nose", pose: {} },
      { s: foxS, label: "fox snout", pose: { expression: "curious" as Expression } },
      { s: penguinS, label: "penguin", pose: {} },
      { s: mouseS, label: "mouse", pose: { expression: "happy" as Expression } },
    ],
  },
  {
    theme: "night",
    cells: [
      ...EXPR.map((e) => ({ s: dragon, label: e, pose: { expression: e } })),
      { s: bunny, label: "bunny", pose: {} },
      { s: cat, label: "cat curious", pose: { expression: "curious" as Expression } },
      { s: bear, label: "bear proud", pose: { expression: "proud" as Expression } },
    ],
  },
  {
    theme: "night",
    cells: GEST.map((g, i) => ({
      s: i % 2 ? bunny : cat,
      label: g,
      pose: { gesture: { kind: g, p: g === "spin" ? 0.3 : 0.5 } },
    })),
  },
  {
    theme: "night",
    cells: [
      { s: ghost, label: "ghost", pose: {} },
      { s: ghost, label: "ghost scared", pose: { expression: "scared" } },
      { s: slime, label: "slime happy", pose: { expression: "happy" } },
      { s: owl, label: "owl curious", pose: { expression: "curious" } },
      { s: imp, label: "imp proud", pose: { expression: "proud" } },
      { s: slime, label: "slime hop", pose: { moving: 1, walk: 1.4 } },
      { s: dragon, label: "dragon walk", pose: { moving: 1, walk: 1.2 } },
      { s: bunny, label: "bunny walk", pose: { moving: 1, walk: -1.3 } },
      { s: bear, label: "draw 0.45", pose: { draw: 0.45 } },
      { s: owl, label: "draw 0.7", pose: { draw: 0.7 } },
    ],
  },
  {
    theme: "day",
    cells: [
      { s: bunny, label: "happy", pose: { expression: "happy" } },
      { s: cat, label: "worried", pose: { expression: "worried" } },
      { s: bear, label: "sleepy", pose: { expression: "sleepy" } },
      { s: dragon, label: "wave", pose: { gesture: { kind: "wave", p: 0.4 } } },
      { s: ghost, label: "sleep", pose: { gesture: { kind: "sleep", p: 0.6 } } },
      { s: owl, label: "hide", pose: { gesture: { kind: "hide", p: 0.5 } } },
      { s: slime, label: "shiver", pose: { gesture: { kind: "shiver", p: 0.5 } } },
      { s: imp, label: "facing left", pose: { facing: -1 } },
      { s: cat, label: "react", pose: { react: 0.5 } },
      { s: bear, label: "peek", pose: { gesture: { kind: "peek", p: 0.5 } } },
    ],
  },
];

const CW = 140, RH = 245, CH = 150;

export default function RigsPage() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = CW * 10 * dpr;
    c.height = RH * ROWS.length * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ROWS.forEach((row, r) => {
      const ink = { theme: row.theme, inkMode: "mono" as const };
      ctx.fillStyle = bg(row.theme);
      ctx.fillRect(0, r * RH, CW * 10, RH);
      row.cells.forEach((cell, i) => {
        const pose: CharPose = {
          x: i * CW + CW / 2, y: r * RH + 205, height: CH, facing: 1, draw: 1, walk: 0, moving: 0,
          expression: "neutral", gesture: null, react: 0, t: 1.3, ...cell.pose,
        };
        drawCharacter(ctx, cell.s, pose, { ink, seed: cell.s.id, wobble: 0.3 });
        ctx.fillStyle = fg(row.theme);
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(cell.label.toUpperCase(), i * CW + CW / 2, r * RH + 232);
        ctx.strokeStyle = fg(row.theme);
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.moveTo(i * CW + 10, r * RH + 205.5);
        ctx.lineTo(i * CW + CW - 10, r * RH + 205.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    });
  }, []);
  return <canvas ref={ref} style={{ width: CW * 10, height: RH * ROWS.length, display: "block" }} />;
}

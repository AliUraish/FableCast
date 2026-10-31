"use client";
// Director's View: what the system decided, line by line (Geist Mono throughout).
import { useEffect, useRef } from "react";
import { stroke } from "@/engine/primitives";
import type { PlaybackState } from "@/engine/state";
import type { ThemeMode, Timeline } from "@/engine/types";
import type { PreparedStory } from "@/lib/api-types";
import type { ColorName } from "@/lib/schemas";
import { INK_MODE } from "@/lib/client/session";
import { agentName } from "./CastStrip";

function InkSample({ ink, wobble, theme }: { ink: ColorName; wobble: number; theme: ThemeMode }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 40 * dpr;
    c.height = 20 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 40, 20);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) pts.push([2 + i * 1.8, 10 + Math.sin(i / 3) * 5]);
    try {
      stroke(ctx, pts, 1, { ink: { theme, inkMode: INK_MODE }, color: ink, width: 2, seed: `sample:${ink}`, wobble });
    } catch {}
  }, [ink, wobble, theme]);
  return <canvas ref={ref} width={40} height={20} style={{ width: 40, height: 20 }} aria-hidden />;
}

export function DirectorDrawer(props: {
  timeline: Timeline;
  prepared: PreparedStory;
  state: PlaybackState | null;
  theme: ThemeMode;
  onSeek: (t: number) => void;
  live: boolean; // while live: only lines already spoken, and no seeking
  t: number;
  onClose: () => void;
  extraWarnings: string[];
}) {
  const { timeline: tl, prepared, state } = props;
  const line = state?.activeLine ?? null;
  const d = line?.decision;
  const scenes = prepared.scenes.filter(Boolean);
  const m = scenes.reduce(
    (a, s) => {
      const x = s!.metrics;
      a.jevCalls += x.jevCalls;
      a.jevMs += x.jevMsTotal;
      a.chars += x.elevenChars;
      a.hits += x.cacheHits;
      a.tokens += x.claudeTokens;
      if (x.resolvedJevModel) a.model = x.resolvedJevModel;
      return a;
    },
    { jevCalls: 0, jevMs: 0, chars: 0, hits: 0, tokens: 0, model: "" },
  );
  const warnings = [...tl.warnings, ...props.extraWarnings, ...scenes.flatMap((s) => s!.warnings.map((w) => `P${s!.index + 1}: ${w}`))];
  const probs = d?.probabilities ? Object.entries(d.probabilities).sort((a, b) => b[1] - a[1]) : [];
  const currentRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [line?.global]);

  return (
    <aside className="drawer" aria-label="Director's View">
      <div className="drawer-head">
        <strong>DIRECTOR&apos;S VIEW</strong>
        <button type="button" onClick={props.onClose} aria-label="Close Director's View" style={{ minHeight: 32 }}>CLOSE</button>
      </div>

      <h3>PERFORMERS</h3>
      {tl.agents.map((a) => (
        <div className="perf" key={a.id}>
          <div>
            <div>{a.name.toUpperCase()} · {a.mood.toUpperCase()}</div>
            <div className="dim">VOICE: {(prepared.casting[a.id]?.name ?? "—").toUpperCase()} · INK {a.ink.toUpperCase()}</div>
          </div>
          <InkSample ink={a.ink} wobble={a.wobble} theme={props.theme} />
        </div>
      ))}

      <h3>CURRENT LINE</h3>
      {line && d ? (
        <>
          <div className="kv">
            <span className="dim">SPEAKER</span>
            <span>{agentName(tl, d.agentId)}</span>
            <span className="dim">INTENSITY</span>
            <span>{d.intensity} / 2</span>
            <span className="dim">EXPRESSION</span>
            <span>{d.expression.toUpperCase()}</span>
            <span className="dim">EMPHASIS</span>
            <span>{d.emphasis ? "YES" : "NO"}</span>
            <span className="dim">PAUSE</span>
            <span>{d.pause.toUpperCase()}</span>
            <span className="dim">JEV</span>
            <span>
              {Math.round(d.latencyMs)} MS <span className="badge">{d.cacheHit ? "CACHE HIT" : "FRESH"}</span>{" "}
              <span className="badge">{(d.source ?? "default").toUpperCase()}</span>
            </span>
          </div>
          {probs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {probs.map(([id, p]) => (
                <div className="bar-row" key={id}>
                  <span>{agentName(tl, id)}</span>
                  <span className="track" aria-label={`${id} ${Math.round(p * 100)} percent`}>
                    <span style={{ width: `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%` }} />
                  </span>
                  <span>{p.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="dim">NO LINE YET</div>
      )}

      <h3>{props.live ? "LINES SO FAR" : "LINES"}</h3>
      <ol className="lines-list">
        {(props.live ? tl.lines.filter((l) => l.start <= props.t) : tl.lines).map((l) => {
          const cur = line?.global === l.global;
          return (
            <li key={l.global}>
              <button
                type="button"
                ref={cur ? currentRef : undefined}
                className={cur ? "current" : undefined}
                disabled={props.live}
                title={props.live ? "Seeking unlocks when the story ends" : undefined}
                onClick={() => props.onSeek(l.start)}
              >
                P{l.scene + 1}·{l.index + 1} {agentName(tl, l.agentId)}: {l.text}
              </button>
            </li>
          );
        })}
      </ol>

      <h3>METRICS</h3>
      <div className="kv">
        <span className="dim">JEV</span>
        <span>DECIDED {tl.lines.length} LINES IN {Math.round(m.jevMs)} MS ({m.jevCalls} CALLS)</span>
        <span className="dim">ELEVENLABS</span>
        <span>{m.chars} CHARACTERS</span>
        <span className="dim">CLAUDE</span>
        <span>{m.tokens} TOKENS</span>
        <span className="dim">CACHE</span>
        <span>{m.hits} HITS</span>
        <span className="dim">MODEL</span>
        <span>{m.model || "—"}</span>
        <span className="dim">PAGES</span>
        <span>{scenes.length} / {prepared.scenes.length} READY</span>
      </div>

      <h3>WARNINGS</h3>
      {warnings.length ? (
        <ul className="lines-list">
          {warnings.map((w, i) => (
            <li key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--fg-35)" }}>WARN {w}</li>
          ))}
        </ul>
      ) : (
        <div className="dim">NONE</div>
      )}
    </aside>
  );
}

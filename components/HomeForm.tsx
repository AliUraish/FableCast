"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MAX_STORIES, MAX_STORY_SECONDS, loadTone, newStoryId, saveRequest, saveTone, storiesLeft } from "@/lib/client/session";
import type { Tone } from "@/lib/schemas";
import { DEFAULT_TONE, TONE_IDS, TONES } from "@/lib/tones";
import { CONVEX_URL } from "./ConvexClientProvider";
import { useTheme } from "@/hooks/useTheme";
import { BounceTitle } from "./BounceTitle";
import { PixelIcon } from "./PixelIcon";

const LIMIT = 200;

// Stories left today for everyone, live from Convex (the server enforces it; this is the hint).
function useTonightConvex(): { left: number; total: number } | null {
  const day = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const r = useQuery(api.stories.tonight, { day });
  return r && r.left !== null ? { left: r.left, total: r.runs } : null;
}
const useTonight = CONVEX_URL ? useTonightConvex : () => null;
const EXAMPLES = [
  "a sleepy dragon who is afraid of the dark",
  "a little owl who lost her way home",
  "a bear cub who cannot fall asleep",
];

export function HomeForm() {
  const router = useRouter();
  const [theme] = useTheme();
  const [text, setText] = useState("");
  const [left, setLeft] = useState(MAX_STORIES);
  const [goldenTitle, setGoldenTitle] = useState<string | null>(null);
  const tonight = useTonight();
  const [tone, setTone] = useState<Tone>(DEFAULT_TONE);
  const leftNow = tonight ? tonight.left : left;
  const total = tonight ? tonight.total : MAX_STORIES;

  useEffect(() => {
    setLeft(storiesLeft());
    setTone(loadTone());
    // Also warms the golden-story chunk so it plays offline later.
    import("@/data/golden/story.json")
      .then((m) => {
        const s = ((m as { default?: unknown }).default ?? m) as { bible?: { title?: string } };
        if (s?.bible?.title) setGoldenTitle(s.bible.title);
      })
      .catch(() => {});
  }, []);

  const premise = text.trim();
  const disabled = !premise || leftNow <= 0;

  const submit = () => {
    if (disabled) return;
    const id = newStoryId();
    saveRequest(id, { premise, theme, tone });
    router.push(`/story/${id}`);
  };

  return (
    <main className="home-main">
      <BounceTitle />
      <h1 className="serif-title" style={{ margin: 0 }}>What story tonight?</h1>
      <label htmlFor="premise" className="sr-only">Story premise</label>
      <textarea
        id="premise"
        className="prompt-input"
        placeholder="a sleepy dragon who is afraid of the dark"
        maxLength={LIMIT}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, LIMIT))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="row between mono dim">
        <span>
          UP TO {MAX_STORY_SECONDS} SEC · {leftNow} OF {total} STORIES LEFT{tonight ? " TONIGHT" : ""}
        </span>
        <span aria-live="polite">
          {text.length}/{LIMIT}
        </span>
      </div>
      <div className="row" role="radiogroup" aria-label="Story tone">
        <span className="mono dim">TONE</span>
        {TONE_IDS.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tone === t}
            className={`chip${tone === t ? " chip-on" : ""}`}
            onClick={() => {
              setTone(t);
              saveTone(t);
            }}
          >
            {TONES[t].label}
          </button>
        ))}
      </div>
      <button type="button" className="btn-primary" disabled={disabled} onClick={submit}>
        Tell me a story <PixelIcon name="arrow" size={14} />
      </button>
      <div className="row" aria-label="Examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => setText(ex)}>
            {ex}
          </button>
        ))}
      </div>
      <div className="row">
        <span className="mono dim">READY STORIES</span>
        <Link className="btn chip" href="/story/golden">
          {goldenTitle ?? "A READY STORY"} <PixelIcon name="arrow" size={10} />
        </Link>
      </div>
    </main>
  );
}

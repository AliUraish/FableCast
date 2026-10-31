// Jev router (readme 8.1): one request per line, all questions answered against the same state in one call.
// Jev is called DIRECTLY on TypeSafe's API (no Vercel AI Gateway): POST https://api.typesafe.ai/v1/systemone.
// Fallback chain: Jev -> Claude tagging call (one per scene) -> mock heuristic -> default decision.
import { z } from "zod";
import { structured } from "./anthropic";
import { cached } from "./cache";
import { env, modes } from "./env";
import { claudeBudgetSpent } from "./limits";
import { defaultDecision, mockDecision } from "./mock";
import { HttpError, errMsg, guarded, pool, retry, withTimeout } from "./resilience";
import { Expression, NARRATOR, NARRATOR_AGENT, type LineDecision, type StoryBible } from "./schemas";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";

type JevQuestion =
  | { type: "choice"; instructions?: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions?: string; criteria: string[] }
  | { type: "noul"; instructions?: string; criteria?: { true?: string; false?: string } };

type JevAnswer =
  | { type: "choice"; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: "score"; score: number; confidence?: number; probabilities?: Record<string, number> }
  | { type: "noul"; noul: number };

interface JevResponse { model: string; answers: Record<string, JevAnswer>; usage?: { input_tokens: number } }

const EXPRESSIONS: Record<z.infer<typeof Expression>, string> = {
  neutral: "Calm, plain", happy: "Joy, laughter", curious: "Wonder, questions", worried: "Unsure, anxious",
  scared: "Frightened", sleepy: "Tired, drowsy", proud: "Brave, accomplished",
};

export function jevQuestions(bible: StoryBible): Record<string, JevQuestion> {
  return {
    agent: {
      type: "choice",
      instructions: "Which mood performer should speak this line?",
      criteria: Object.fromEntries(bible.agents.map((a) => [a.id, `${a.name} (${a.mood}): ${a.routingHints.join("; ")}`])),
    },
    intensity: {
      type: "score",
      instructions: "How emotionally intense is this line?",
      criteria: ["Calm, background narration", "Clear emotion", "Peak moment of the scene"],
    },
    pause: {
      type: "choice",
      instructions: "How long should the performance pause after this line?",
      criteria: { none: "Flows straight into the next line", short: "A natural beat", long: "A dramatic beat or the end of the scene" },
    },
    expression: {
      type: "choice",
      instructions: "What expression does the character show during this line?",
      criteria: EXPRESSIONS,
    },
    emphasis: { type: "noul", instructions: "Is this a key moment that deserves a hand-drawn highlight?" },
  };
}

function lineState(bible: StoryBible, sceneIdx: number, lineIdx: number) {
  const scene = bible.scenes[sceneIdx];
  const line = scene.lines[lineIdx];
  const prev = lineIdx > 0 ? scene.lines[lineIdx - 1].text : sceneIdx > 0 ? bible.scenes[sceneIdx - 1].lines.at(-1)?.text ?? "" : "";
  const who = line.character === NARRATOR ? "narrator" : bible.characters.find((c) => c.id === line.character)?.name ?? line.character;
  return {
    sceneSummary: scene.summary,
    sceneMood: scene.mood,
    previousLine: prev,
    character: who,
    line: line.text,
    isLastLineOfScene: lineIdx === scene.lines.length - 1,
  };
}

async function callJev(model: string, state: unknown, questions: Record<string, JevQuestion>): Promise<JevResponse> {
  const key = env().jevKey;
  return guarded("jev", () =>
    retry(
      () =>
        withTimeout(5_000, async (signal) => {
          const res = await fetch(JEV_URL, {
            method: "POST",
            signal,
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, state, questions }),
          });
          if (!res.ok) throw new HttpError(res.status, `Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
          return (await res.json()) as JevResponse;
        }),
      { retries: 2, baseMs: 300 },
    ),
  );
}

/** Turn a raw Jev response into a LineDecision (thresholds live here, in our code). */
export function toDecision(r: JevResponse, agentIds: string[], floor: number): Omit<LineDecision, "latencyMs" | "cacheHit"> {
  const a = r.answers.agent;
  const i = r.answers.intensity;
  const p = r.answers.pause;
  const x = r.answers.expression;
  const e = r.answers.emphasis;
  let agentId = NARRATOR_AGENT;
  let probabilities: Record<string, number> | undefined;
  if (a?.type === "choice") {
    probabilities = a.probabilities;
    const prob = a.probabilities?.[a.choice] ?? 0;
    if (agentIds.includes(a.choice) && prob >= floor) agentId = a.choice;
  }
  const score = i?.type === "score" ? i.score : 1; // 3 levels -> 0..2
  const intensity = Math.max(0, Math.min(2, Math.round(score))) as 0 | 1 | 2;
  const pause = p?.type === "choice" && ["none", "short", "long"].includes(p.choice) ? (p.choice as LineDecision["pause"]) : "short";
  const parsedX = Expression.safeParse(x?.type === "choice" ? x.choice : "neutral");
  const emphasis = e?.type === "noul" ? e.noul >= 0.5 : false;
  return { agentId, intensity, pause, expression: parsedX.success ? parsedX.data : "neutral", emphasis, probabilities, source: "jev" };
}

// ---------- Claude tagging fallback (one call per scene) ----------
const TagSchema = z.object({
  lines: z.array(
    z.object({
      agentId: z.string(),
      intensity: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      pause: z.enum(["none", "short", "long"]),
      expression: Expression,
      emphasis: z.boolean(),
    }),
  ),
});

async function claudeTags(bible: StoryBible, sceneIdx: number): Promise<{ decisions: LineDecision[]; tokens: number }> {
  const e = env();
  const scene = bible.scenes[sceneIdx];
  const t0 = Date.now();
  const r = await structured({
    model: e.stagingModel,
    system:
      "You tag lines of a children's bedtime story for performance. For each line pick the mood performer (agentId) who should speak it, " +
      "intensity 0 calm / 1 clear emotion / 2 peak, the pause after it, the character's expression, and whether it is a key moment worth a highlight (at most one or two per scene).",
    prompt: JSON.stringify({
      performers: bible.agents.map((a) => ({ id: a.id, mood: a.mood, when: a.routingHints })),
      scene: { summary: scene.summary, mood: scene.mood },
      lines: scene.lines.map((l) => ({ character: l.character, text: l.text })),
    }),
    toolName: "line_tags",
    schema: TagSchema,
    maxTokens: 1500,
    timeoutMs: 20_000,
    check: (v) => (v.lines.length === scene.lines.length ? null : `Return exactly ${scene.lines.length} lines.`),
  });
  const ids = bible.agents.map((a) => a.id);
  const ms = Date.now() - t0;
  return {
    tokens: r.tokens,
    decisions: r.value.lines.map((d) => ({
      ...d,
      agentId: ids.includes(d.agentId) ? d.agentId : NARRATOR_AGENT,
      latencyMs: Math.round(ms / scene.lines.length),
      cacheHit: false,
      source: "claude" as const,
    })),
  };
}

export interface Routed {
  decisions: LineDecision[];
  jevCalls: number;
  jevMsTotal: number;
  claudeTokens: number;
  cacheHits: number;
  resolvedJevModel?: string;
  warnings: string[];
}

export async function routeScene(bible: StoryBible, sceneIdx: number): Promise<Routed> {
  const e = env();
  const m = modes(e);
  const scene = bible.scenes[sceneIdx];
  const out: Routed = { decisions: [], jevCalls: 0, jevMsTotal: 0, claudeTokens: 0, cacheHits: 0, warnings: [] };
  const agentIds = bible.agents.map((a) => a.id);

  if (m.jev === "live") {
    const questions = jevQuestions(bible);
    const results = await pool(scene.lines, 8, async (_l, li) => {
      const state = lineState(bible, sceneIdx, li);
      const t0 = performance.now();
      try {
        const r = await cached("jev", { model: e.jevModel, state, questions }, () => callJev(e.jevModel, state, questions));
        const latencyMs = Math.round(performance.now() - t0);
        if (r.hit) out.cacheHits++;
        else {
          out.jevCalls++;
          out.jevMsTotal += latencyMs;
        }
        out.resolvedJevModel = r.value.model ?? e.jevModel;
        return { ...toDecision(r.value, agentIds, e.agentFloor), latencyMs, cacheHit: r.hit } as LineDecision;
      } catch (err) {
        out.warnings.push(`Jev line ${li}: ${errMsg(err).slice(0, 120)}`);
        return null;
      }
    });
    if (results.every(Boolean)) {
      out.decisions = results as LineDecision[];
      return out;
    }
    // Some lines failed: fill them from the next link in the chain.
    const fill = await fallbackDecisions(bible, sceneIdx, out);
    out.decisions = results.map((d, i) => d ?? fill[i]);
    return out;
  }
  out.decisions = await fallbackDecisions(bible, sceneIdx, out);
  return out;
}

async function fallbackDecisions(bible: StoryBible, sceneIdx: number, out: Routed): Promise<LineDecision[]> {
  const e = env();
  const scene = bible.scenes[sceneIdx];
  if (modes(e).claude === "live" && !claudeBudgetSpent()) {
    try {
      const r = await cached("tag", { bible: bible.title, agents: bible.agents, scene, model: e.stagingModel }, () => claudeTags(bible, sceneIdx));
      if (r.hit) out.cacheHits++;
      else out.claudeTokens += r.value.tokens;
      return r.value.decisions;
    } catch (err) {
      out.warnings.push(`Claude tagging failed: ${errMsg(err).slice(0, 120)}`);
    }
  }
  try {
    return scene.lines.map((_l, li) => mockDecision(bible, sceneIdx, li));
  } catch (err) {
    out.warnings.push(`mock routing failed: ${errMsg(err).slice(0, 120)}`);
    return scene.lines.map(() => defaultDecision());
  }
}

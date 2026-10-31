"use client";
// Every character in the story, from the start, with live on-stage / speaking state.
import type { PlaybackState } from "@/engine/state";
import type { ThemeMode, Timeline } from "@/engine/types";
import { NARRATOR, NARRATOR_AGENT } from "@/lib/schemas";
import { CastCard } from "./CastCard";

export function agentName(tl: Timeline, agentId: string | null | undefined): string | null {
  if (!agentId) return null;
  if (agentId === NARRATOR_AGENT) return "NARRATOR";
  return tl.agents.find((a) => a.id === agentId)?.name.toUpperCase() ?? agentId.toUpperCase();
}

export function CastStrip(props: {
  timeline: Timeline;
  state: PlaybackState | null;
  pageTheme: ThemeMode;
  onTap: (id: string) => void;
}) {
  const { timeline: tl, state } = props;
  const speaking = state?.speakingCharacterId ?? null;
  const voice = agentName(tl, state?.speakingAgentId);
  return (
    <div className="cast" role="list" aria-label="Characters">
      <div role="listitem">
        <CastCard
          id={NARRATOR}
          name="NARRATOR"
          skin={null}
          state="NARRATOR"
          speaking={speaking === NARRATOR}
          voice={voice}
          expression={null}
          pageTheme={props.pageTheme}
          onTap={props.onTap}
        />
      </div>
      {tl.characters.map((c) => {
        const on = state?.onStage.includes(c.id) ?? false;
        return (
          <div role="listitem" key={c.id}>
            <CastCard
              id={c.id}
              name={c.name.toUpperCase()}
              skin={c}
              state={on ? "ON STAGE" : "OFFSTAGE"}
              speaking={speaking === c.id}
              voice={voice}
              expression={on ? (state?.expressions[c.id] ?? "neutral").toUpperCase() : null}
              pageTheme={props.pageTheme}
              onTap={props.onTap}
            />
          </div>
        );
      })}
    </div>
  );
}

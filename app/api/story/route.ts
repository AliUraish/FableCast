// POST /api/story: premise -> StoryBible + casting. Session limits are enforced here (server side).
import { NextRequest, NextResponse } from "next/server";
import type { ApiError, StoryRequest } from "@/lib/api-types";
import { checkStory, recordStory, SESSION_COOKIE, sessionId } from "@/lib/limits";
import { InputError, cleanPremise, runStory } from "@/lib/pipeline";
import { Tone } from "@/lib/schemas";
import { errMsg } from "@/lib/resilience";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function withSession(res: NextResponse, id: string, fresh: boolean) {
  if (fresh) res.cookies.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return res;
}

export async function POST(req: NextRequest) {
  const { id, fresh } = sessionId(req.cookies.get(SESSION_COOKIE)?.value);
  let body: StoryRequest;
  try {
    body = (await req.json()) as StoryRequest;
  } catch {
    return withSession(NextResponse.json<ApiError>({ error: "Invalid JSON", code: "BAD_INPUT" }, { status: 400 }), id, fresh);
  }
  try {
    const premise = cleanPremise(body?.premise);
    const key = premise.toLowerCase();
    const check = checkStory(id, key);
    if (!check.ok) return withSession(NextResponse.json<ApiError>({ error: check.reason ?? "Limit reached", code: "LIMIT" }, { status: 429 }), id, fresh);
    const tone = Tone.safeParse(body.tone);
    const story = await runStory({ premise, theme: body.theme === "day" ? "day" : "night", tone: tone.success ? tone.data : undefined });
    story.limits.storiesLeft = recordStory(id, key);
    return withSession(NextResponse.json(story), id, fresh);
  } catch (err) {
    if (err instanceof InputError) return withSession(NextResponse.json<ApiError>({ error: err.message, code: "BAD_INPUT" }, { status: 400 }), id, fresh);
    console.error("[api/story]", err);
    return withSession(NextResponse.json<ApiError>({ error: errMsg(err).slice(0, 200), code: "INTERNAL" }, { status: 500 }), id, fresh);
  }
}

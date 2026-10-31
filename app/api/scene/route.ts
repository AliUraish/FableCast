// POST /api/scene: one scene -> staging + per-line decisions + voiced audio with word times.
// Stateless: the client sends the bible and casting back, so any instance can serve any scene.
import { NextRequest, NextResponse } from "next/server";
import type { ApiError, SceneRequest } from "@/lib/api-types";
import { checkScene, SESSION_COOKIE, sessionId } from "@/lib/limits";
import { InputError, runScene } from "@/lib/pipeline";
import { errMsg } from "@/lib/resilience";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { id } = sessionId(req.cookies.get(SESSION_COOKIE)?.value);
  const check = checkScene(id);
  if (!check.ok) return NextResponse.json<ApiError>({ error: check.reason ?? "Limit reached", code: "LIMIT" }, { status: 429 });
  let body: SceneRequest;
  try {
    body = (await req.json()) as SceneRequest;
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON", code: "BAD_INPUT" }, { status: 400 });
  }
  try {
    return NextResponse.json(await runScene(body));
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json<ApiError>({ error: err.message, code: "BAD_INPUT" }, { status: 400 });
    console.error("[api/scene]", err);
    return NextResponse.json<ApiError>({ error: errMsg(err).slice(0, 200), code: "INTERNAL" }, { status: 500 });
  }
}

"use client";
// Convex client for the whole app. Without NEXT_PUBLIC_CONVEX_URL the app falls back to the
// Next.js API routes (lib/client/loader.ts picks the path once, at module load).
import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

export const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
const client = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return client ? <ConvexProvider client={client}>{children}</ConvexProvider> : <>{children}</>;
}

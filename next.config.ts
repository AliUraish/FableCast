import type { NextConfig } from "next";

// One value to edit: the UI reads the story ceiling from the same env var the server enforces.
const clean = (v: string | undefined, d: string) => (v ?? d).split("#")[0].trim() || d;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_MAX_STORY_SECONDS: clean(process.env.MAX_STORY_SECONDS, "120"),
    NEXT_PUBLIC_MAX_STORIES_PER_SESSION: clean(process.env.MAX_STORIES_PER_SESSION, "5"),
    NEXT_PUBLIC_MAX_GENERATION_SECONDS: clean(process.env.MAX_GENERATION_SECONDS, "45"),
    NEXT_PUBLIC_INK_MODE: clean(process.env.INK_MODE, "mono"),
  },
};

export default nextConfig;

"use client";
// Dev preview of the loading screen (stories generate too fast in mock mode to see it).
import { useEffect, useState } from "react";
import { LoadingBoard } from "@/components/LoadingBoard";

export default function LoadingPreview() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <LoadingBoard
        theme="night"
        elapsed={elapsed}
        failed={false}
        status={[
          { key: "write", label: "WRITING THE STORY", state: elapsed > 6 ? "ok" : "pending" },
          { key: "cast", label: "CASTING 4 PERFORMERS", state: elapsed > 6 ? "ok" : "pending" },
          { key: "scene0", label: "VOICING PAGE 1", state: "pending" },
        ]}
      />
    </main>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { CONVEX_URL } from "@/components/ConvexClientProvider";
import type { HealthResponse } from "@/lib/api-types";

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Provider keys live in Convex, so health asks a Convex action (API route only as a fallback).
    const load: Promise<HealthResponse> = CONVEX_URL
      ? new ConvexHttpClient(CONVEX_URL).action(api.pipeline.health, {})
      : fetch("/api/health", { cache: "no-store" }).then((r) => r.json());
    load
      .then((d: HealthResponse) => setData(d))
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <main className="health">
      <p>
        <Link href="/">← FABLECAST</Link>
      </p>
      <h1 className="pixel-label">HEALTH</h1>
      {err && <p>FAIL {err}</p>}
      {!data && !err && <p>CHECKING ...</p>}
      {data && (
        <>
          <table>
            <thead>
              <tr>
                <th>PROVIDER</th>
                <th>STATUS</th>
                <th>DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {(data.providers ?? []).map((p) => (
                <tr key={p.name}>
                  <td>{p.name.toUpperCase()}</td>
                  <td>{p.ok ? "OK" : "FAIL"}</td>
                  <td>{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="mono" style={{ marginTop: 24 }}>CONFIG</h2>
          <table>
            <tbody>
              {Object.entries(data.config ?? {}).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

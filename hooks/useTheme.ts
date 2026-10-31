"use client";
import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "@/engine/types";

const KEY = "fablecast:theme";
const EVENT = "fablecast:theme";

function current(): ThemeMode {
  if (typeof document === "undefined") return "night";
  return document.documentElement.getAttribute("data-theme") === "day" ? "day" : "night";
}

/** Base theme (Night pages / Day pages). Every instance stays in sync; the choice persists. */
export function useTheme(): [ThemeMode, (t: ThemeMode) => void] {
  const [theme, setState] = useState<ThemeMode>("night");

  useEffect(() => {
    setState(current());
    const on = () => setState(current());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const setTheme = useCallback((t: ThemeMode) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [theme, setTheme];
}

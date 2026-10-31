"use client";
import { useCallback, useEffect, useState } from "react";

/** A boolean UI setting persisted in localStorage (captions on/off). */
export function usePersistedBool(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v === "1" || v === "0") setValue(v === "1");
    } catch {}
  }, [key]);

  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {}
    },
    [key],
  );

  return [value, set];
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

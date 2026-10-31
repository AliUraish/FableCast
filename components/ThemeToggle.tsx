"use client";
import { useTheme } from "@/hooks/useTheme";

/** `[ NIGHT | DAY ]` in Geist Mono. */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="toggle" role="group" aria-label="Page theme">
      <span className="bracket" aria-hidden>[</span>
      <button type="button" aria-pressed={theme === "night"} onClick={() => setTheme("night")}>
        NIGHT
      </button>
      <span className="sep" aria-hidden>|</span>
      <button type="button" aria-pressed={theme === "day"} onClick={() => setTheme("day")}>
        DAY
      </button>
      <span className="bracket" aria-hidden>]</span>
    </div>
  );
}

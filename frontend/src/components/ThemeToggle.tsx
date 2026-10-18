"use client";

/**
 * Light/dark theme toggle button.
 *
 * Cycles the resolved theme between light and dark. Renders a stable
 * placeholder until mounted, because the resolved theme is only known on the
 * client (next-themes reads localStorage / the system preference after
 * hydration) — rendering the real icon on the server would risk a mismatch.
 */

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

// subscribe is required by useSyncExternalStore but this "store" never
// changes — we only use the client/server snapshot split to know, on the
// very first client render, whether we're past hydration. That happens
// immediately (no extra render), unlike a useEffect(() => setMounted(true)).
const emptySubscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isDark = resolvedTheme === "dark";
  const base =
    "flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

  if (!mounted) {
    // Placeholder keeps layout stable and avoids a hydration mismatch.
    return (
      <span
        aria-hidden="true"
        className={`${base} ${className ?? ""}`}
      >
        <Sun className="h-4 w-4" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`${base} ${className ?? ""}`}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

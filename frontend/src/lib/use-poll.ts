"use client";

import { useEffect, useRef } from "react";

/**
 * Run `tick` every `ms` while `active`, only when the tab is visible.
 * State updates belong inside tick's async callbacks (never synchronously).
 */
export function usePoll(tick: () => void | Promise<void>, ms: number, active: boolean) {
  const ref = useRef(tick);
  useEffect(() => {
    ref.current = tick;
  });
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

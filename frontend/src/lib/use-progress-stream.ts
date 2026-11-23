"use client";

import { useEffect, useRef, useState } from "react";
import type { GenerationProgress } from "@/types/test";

/**
 * Subscribes to a backend progress SSE stream (through /api/proxy) while `url`
 * is set. Returns the latest event for that url, or null before the first one.
 * The stream closes itself at pct >= 100; `onDone` fires once then.
 * A dropped connection is not an error: callers also poll the status endpoint,
 * which stays the source of truth for completion.
 */
export function useProgressStream(url: string | null, onDone?: () => void): GenerationProgress | null {
  const [latest, setLatest] = useState<{ url: string; data: GenerationProgress } | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!url) return;
    const source = new EventSource(url);
    source.onmessage = (e) => {
      let data: GenerationProgress;
      try {
        data = JSON.parse(e.data as string) as GenerationProgress;
      } catch {
        return; // keep-alive or partial line
      }
      setLatest({ url, data });
      if (data.pct >= 100) {
        source.close();
        done.current?.();
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [url]);

  return latest && latest.url === url ? latest.data : null;
}

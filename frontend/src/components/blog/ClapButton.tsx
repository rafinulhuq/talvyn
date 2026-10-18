"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

const MAX_CLAPS_PER_READER = 50;
const FLUSH_DELAY_MS = 900;

function storageKey(slug: string): string {
  return `talvyn-claps:${slug}`;
}

/**
 * Medium-style clap control: taps count up instantly, get batched, and are
 * sent as one request when the reader pauses. Per-reader total is capped
 * and remembered in localStorage.
 */
export function ClapButton({ slug, initialClaps }: { slug: string; initialClaps: number }) {
  const [total, setTotal] = useState(initialClaps);
  const [myClaps, setMyClaps] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(window.localStorage.getItem(storageKey(slug)) ?? "0");
    return Number.isFinite(stored) && stored > 0 ? Math.min(stored, MAX_CLAPS_PER_READER) : 0;
  });
  const [bump, setBump] = useState(false);
  const pendingRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flushPending() {
    const count = pendingRef.current;
    pendingRef.current = 0;
    if (count < 1) return;
    void fetch(`/api/public/api/v1/cmp/public/blog/${encodeURIComponent(slug)}/clap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
      // Survives navigating away mid-flush.
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { claps?: number };
        if (typeof data.claps === "number") setTotal(data.claps);
      })
      .catch(() => {
        // Network hiccup — the optimistic count stays; claps aren't critical.
      });
  }

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function clap() {
    if (myClaps >= MAX_CLAPS_PER_READER) return;
    const next = myClaps + 1;
    setMyClaps(next);
    setTotal((prev) => prev + 1);
    window.localStorage.setItem(storageKey(slug), String(next));
    setBump(true);
    setTimeout(() => setBump(false), 200);

    pendingRef.current += 1;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushPending, FLUSH_DELAY_MS);
  }

  const maxed = myClaps >= MAX_CLAPS_PER_READER;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={clap}
        disabled={maxed}
        aria-label={maxed ? "You reached the clap limit for this post" : "Clap for this post"}
        title={maxed ? "You reached the clap limit for this post" : "Clap for this post"}
        className={clsx(
          "flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-xl shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900",
          "hover:border-slate-300 hover:bg-slate-50 active:scale-95 dark:hover:border-slate-700 dark:hover:bg-slate-800",
          bump && "scale-110",
          maxed && "opacity-50 cursor-not-allowed hover:scale-100"
        )}
      >
        <span aria-hidden>👏</span>
      </button>
      <span className="text-xs font-semibold text-slate-900 dark:text-white">
        {total.toLocaleString()}
        {myClaps > 0 && <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">+{myClaps} YOU</span>}
      </span>
    </div>
  );
}

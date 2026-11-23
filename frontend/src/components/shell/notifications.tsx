"use client";

import * as Popover from "@radix-ui/react-popover";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";

type Completion = {
  attempt_id: string;
  candidate_name: string;
  jd_title: string;
  submitted_at: string;
  has_evaluation: boolean;
};

// Same key as the previous UI so read state survives the redesign.
const SEEN_KEY = "talvyn_seen_attempts_v1";
const POLL_MS = 60_000;

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Recently submitted tests (last 7 days). Read state is per browser. */
export function Notifications() {
  const [items, setItems] = useState<Completion[] | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : loadSeen()));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void api<{ items: Completion[] }>("/api/v1/stats/completions?days=7&limit=50").then((res) => {
        if (alive && res.ok) setItems(res.data.items);
      });
    load();
    // Poll only while the tab is visible.
    const id = setInterval(() => document.visibilityState === "visible" && load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const unread = useMemo(() => (items ?? []).filter((i) => !seen.has(i.attempt_id)), [items, seen]);

  const markAllRead = () => {
    const next = new Set([...seen, ...(items ?? []).map((i) => i.attempt_id)]);
    setSeen(next);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-500)));
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
          className="relative grid size-8 place-items-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
        >
          <Bell aria-hidden className="size-4" />
          {unread.length > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-canvas bg-accent" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-menu border border-line bg-surface shadow-float animate-pop-in"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-base font-medium">Submitted tests</h2>
            {unread.length > 0 && (
              <button type="button" onClick={markAllRead} className="flex items-center gap-1.5 rounded-control text-sm text-ink-muted hover:text-ink">
                <CheckCheck aria-hidden className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          {items === null ? (
            <p className="px-4 py-8 text-center text-base text-ink-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-base text-ink-muted">No tests submitted in the last 7 days.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {items.map((i) => {
                const isUnread = !seen.has(i.attempt_id);
                return (
                  <li key={i.attempt_id}>
                    <Link
                      href={`/dashboard/results/${i.attempt_id}`}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-2.5 hover:bg-sunken"
                    >
                      <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", isUnread ? "bg-accent" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base text-ink">
                          <span className="font-medium">{i.candidate_name}</span> submitted {i.jd_title}
                        </span>
                        <span className="block text-sm text-ink-muted">
                          {formatRelative(i.submitted_at)}
                          {i.has_evaluation ? ", graded" : ", grading pending"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/dashboard/results" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-sm text-ink-muted hover:bg-sunken hover:text-ink">
            View all results
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

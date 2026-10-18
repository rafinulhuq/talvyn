"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import Link from "next/link";
import { Bell, BarChart2, Wand2, X, CheckCheck } from "lucide-react";
import { apiClient } from "@/lib/api/client";

// ── Types ────────────────────────────────────────────────────

interface CompletionItem {
  attempt_id: string;
  candidate_id: string;
  candidate_number: number;
  candidate_name: string;
  candidate_email: string;
  jd_id: string;
  jd_title: string;
  submitted_at: string;
  has_evaluation: boolean;
}

// ── Constants ─────────────────────────────────────────────────

const STORAGE_KEY = "talvyn_seen_attempts_v1";
const POLL_INTERVAL = 15_000; // 15 s

// ── Helpers ───────────────────────────────────────────────────

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistSeenIds(ids: Set<string>): void {
  try {
    const trimmed = [...ids].slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────

export function NotificationBell() {
  const panelId = useId();
  const titleId = useId();
  const [items, setItems] = useState<CompletionItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Track seen IDs in state so marking-as-read causes an immediate re-render
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeenIds());
  const panelRef = useRef<HTMLDivElement>(null);

  const markSeen = useCallback((ids: string[]) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  // Persist to localStorage whenever the seen set actually changes, instead
  // of writing from inside the setSeenIds updater (which React may invoke
  // more than once per update).
  useEffect(() => {
    persistSeenIds(seenIds);
  }, [seenIds]);

  const refresh = useCallback(async () => {
    const res = await apiClient.get<{ items: CompletionItem[] }>(
      "/api/v1/stats/completions?days=7&limit=50"
    );
    if (!res.success) return;
    const fetched = res.data.items;
    // Re-read from localStorage in case another tab updated it
    const currentSeen = loadSeenIds();
    const newCount = fetched.filter((i) => !currentSeen.has(i.attempt_id)).length;
    setItems(fetched);
    setUnread(newCount);
    // Sync state with persisted value
    setSeenIds(currentSeen);
  }, []);

  // Initial load + background polling
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  // Refresh immediately whenever the panel is opened
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Close panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent | KeyboardEvent) {
      if ("key" in e && e.key !== "Escape") return;
      if ("key" in e) {
        setOpen(false);
        return;
      }
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handler);
      document.addEventListener("keydown", handler);
    }
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [open]);

  function handleMarkAllRead() {
    const allIds = items.map((i) => i.attempt_id);
    markSeen(allIds);
    setUnread(0);
  }

  function handleItemClick(attemptId: string) {
    markSeen([attemptId]);
    setUnread((n) => Math.max(0, n - 1));
    setOpen(false);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel — a native, non-modal <dialog> carries the "dialog"
          accessibility role on its own, so no aria-modal/role is needed. */}
      {open && (
        <dialog
          open
          id={panelId}
          aria-labelledby={titleId}
          className="absolute right-0 top-10 left-auto z-50 m-0 max-h-none w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-0 shadow-lg animate-fade-in motion-reduce:animate-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p id={titleId} className="text-sm font-semibold text-slate-900">Notifications</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label="Mark all notifications as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-300 hover:text-slate-500 transition-colors"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {items.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Bell className="h-8 w-8 text-slate-200" />
                <p className="text-xs text-slate-400">No completions yet</p>
                <p className="text-[10px] text-slate-300">
                  Refreshes every 15 seconds
                </p>
              </div>
            )}
            {items.map((item) => {
              const isUnread = !seenIds.has(item.attempt_id);
              return (
                <Link
                  key={item.attempt_id}
                  href={`/dashboard/results/${item.attempt_id}`}
                  onClick={() => handleItemClick(item.attempt_id)}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${
                    isUnread ? "bg-brand-50/40" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50">
                    {item.has_evaluation ? (
                      <BarChart2 className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5 text-brand-700" />
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 truncate">
                      {item.candidate_name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      Candidate #{item.candidate_number} · {item.jd_title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {item.has_evaluation ? "Evaluated · " : "Awaiting evaluation · "}
                      {formatRelative(item.submitted_at)}
                    </p>
                  </div>

                  {isUnread && (
                    <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  )}
                </Link>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 text-center">
              <Link
                href="/dashboard/results"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                View all results →
              </Link>
            </div>
          )}
        </dialog>
      )}
    </div>
  );
}

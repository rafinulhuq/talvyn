"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";

const COOKIE_NAME = "hg_sid";
const CATEGORIES = ["General", "Confusing", "Bug", "Slow", "Suggestion"];

function getCookie(name: string): string | null {
  const found = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function getSessionId(): string {
  const existing = getCookie(COOKIE_NAME);
  if (existing) return existing;
  const id = crypto.randomUUID();
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  return id;
}

function shouldShow(path: string): boolean {
  if (path.startsWith("/tests") || path.startsWith("/test") || path.startsWith("/exam")) return false;
  if (path.startsWith("/dashboard/highgarden")) return false;
  return true;
}

export function HighGardenFeedbackWidget() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(4);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  if (!shouldShow(pathname)) return null;

  async function submit() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await fetch("/api/highgarden/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          path: window.location.pathname || "/",
          rating,
          category,
          comment,
        }),
        keepalive: true,
      }).catch(() => undefined);
      setSent(true);
      setComment("");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  // The launcher floats over page content, so on a phone it has to clear
  // iOS Safari's toolbar (safe-area inset) instead of sitting under it, and
  // the panel has to fit a 320px screen rather than a fixed 20rem.
  return (
    <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40">
      {open && (
        <div className="mb-3 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Share feedback</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close feedback panel" className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          {sent ? (
            <div>
              <p className="text-sm text-slate-600">Thanks. Your feedback was sent.</p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setOpen(false);
                }}
                className="mt-3 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Rating</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className={`h-8 w-8 rounded-full text-sm font-semibold ${
                        rating === value ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Category</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Comment</span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="What happened?"
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? "Sending" : "Send feedback"}
              </button>
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition hover:bg-brand-600"
        aria-label="Share feedback"
      >
        <MessageSquare className="h-5 w-5" />
      </button>
    </div>
  );
}

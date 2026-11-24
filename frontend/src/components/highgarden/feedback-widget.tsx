"use client";

import { MessageSquare } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EXAM_PREFIXES, visitorId } from "@/lib/highgarden";
import { cn } from "@/lib/cn";

const CATEGORIES = ["General", "Confusing", "Bug", "Slow", "Suggestion"];

/** Hidden during a test (no distractions, no stray clicks) and inside Highgarden itself. */
function hiddenOn(path: string) {
  return EXAM_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) || path.startsWith("/dashboard/highgarden");
}

export function FeedbackWidget() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  if (hiddenOn(path)) return null;

  async function submit() {
    if (!rating || state === "sending") return;
    setState("sending");
    // The endpoint always answers 204; feedback must never break a page.
    await fetch("/api/highgarden/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: visitorId(), path: window.location.pathname || "/", rating, category, comment: comment.trim() || undefined }),
      keepalive: true,
    }).catch(() => undefined);
    setState("sent");
    setComment("");
    setRating(null);
  }

  return (
    <div data-hg-ignore className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 print:hidden">
      <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setState("idle"))}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="md" className="shadow-float" aria-label="Feedback">
            <MessageSquare aria-hidden className="size-4" />
            <span className="hidden sm:inline">Feedback</span>
          </Button>
        </PopoverTrigger>
        {/* Portaled outside the root, so it needs its own ignore marker. */}
        <PopoverContent data-hg-ignore side="top" align="end" className="w-[min(20rem,calc(100vw-2rem))] p-4">
          {state === "sent" ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-base text-ink">Thanks, your feedback was sent.</p>
              <Button size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <h2 className="text-md font-medium text-ink">How is this page working for you?</h2>
              <fieldset>
                <legend className="mb-1.5 text-sm text-ink-muted">Rating, 1 (poor) to 5 (great)</legend>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={rating === n}
                      onClick={() => setRating(n)}
                      className={cn(
                        "grid size-8 place-items-center rounded-control border text-sm font-medium tabular-nums transition-colors",
                        rating === n ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-ink-muted hover:text-ink",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 text-sm text-ink-muted">Topic</legend>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                      className={cn(
                        "h-7 rounded-control border px-2 text-sm transition-colors",
                        category === c ? "border-ink bg-sunken text-ink" : "border-line text-ink-muted hover:text-ink",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label="Details" optional>
                <Textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What happened, or what did you expect?" />
              </Field>
              <Button type="submit" variant="primary" disabled={!rating} loading={state === "sending"}>
                Send feedback
              </Button>
            </form>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

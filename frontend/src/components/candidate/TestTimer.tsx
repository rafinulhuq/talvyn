"use client";

import { clsx } from "clsx";
import { Clock } from "lucide-react";

interface TestTimerProps {
  formatted: string;
  urgency: "normal" | "warning" | "critical";
}

export function TestTimer({ formatted, urgency }: TestTimerProps) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums shadow-xs transition-colors",
        urgency === "normal" && "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
        urgency === "warning" && "border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300",
        urgency === "critical" && "border border-rose-300 bg-rose-50 text-rose-800 animate-pulse dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300"
      )}
      role="timer"
      aria-label={`Time remaining: ${formatted}`}
      aria-live="off"
    >
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>{formatted}</span>
    </div>
  );
}

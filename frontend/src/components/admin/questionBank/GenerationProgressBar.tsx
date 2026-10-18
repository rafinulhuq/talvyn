"use client";

import { Loader2 } from "lucide-react";

export interface ProgressState {
  step: string;
  pct: number;
  detail?: string;
}

export function GenerationProgressBar({ progress }: { progress: ProgressState | null }) {
  return (
    <div className="mt-4 rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-4 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
            {progress?.step || "Generating questions..."}
          </p>
        </div>
        {!!progress && progress.pct > 0 && (
          <span className="shrink-0 text-xs font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            {progress.pct}%
          </span>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 ease-out dark:bg-indigo-500"
          style={{ width: `${progress?.pct ?? 0}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {progress?.detail ||
          "Generating questions across 3 sections. Local AI engine executing background inference."}
      </p>
    </div>
  );
}

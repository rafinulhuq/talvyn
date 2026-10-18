/**
 * Horizontal candidate funnel: Invited -> Started -> In Progress -> Submitted
 * -> Reviewed, then split into Recommended / Rejected outcomes.
 * Server-renderable — receives already-fetched stage counts as props.
 */

import { ChevronRight, ThumbsUp, ThumbsDown } from "lucide-react";
import { clsx } from "clsx";

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
}

interface CandidatePipelineProps {
  stages: PipelineStage[];
}

function pct(count: number, of: number): string {
  if (of <= 0) return "0%";
  return `${Math.round((count / of) * 100)}%`;
}

export function CandidatePipeline({ stages }: CandidatePipelineProps) {
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
  const funnel = ["invited", "started", "in_progress", "submitted", "reviewed"]
    .map((key) => byKey[key])
    .filter(Boolean);
  const invited = byKey.invited?.count ?? 0;
  const recommended = byKey.recommended;
  const rejected = byKey.rejected;

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-2 pt-1">
      {funnel.map((stage, i) => {
        const isSubmitted = stage.key === "submitted";
        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={clsx(
                "flex min-w-[130px] flex-col gap-1.5 rounded-xl p-3.5 transition-all duration-150",
                "border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900",
                "hover:border-slate-300 hover:shadow-sm dark:hover:border-slate-700",
                isSubmitted && "ring-1 ring-indigo-500/30 bg-indigo-50/20 dark:bg-indigo-950/20"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {stage.count}
                </span>
                <span className="text-[10px] font-medium text-slate-400">
                  {pct(stage.count, invited)}
                </span>
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {stage.label}
              </span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-[width] duration-300"
                  style={{ width: pct(stage.count, invited) }}
                />
              </div>
            </div>
            {i < funnel.length - 1 && (
              <ChevronRight className="mx-1.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
            )}
          </div>
        );
      })}

      {(recommended || rejected) && (
        <>
          <ChevronRight className="mx-1.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
          <div className="flex gap-2">
            {recommended && (
              <div className="flex min-w-[130px] flex-col gap-1 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-emerald-900 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-display text-xl font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                    <ThumbsUp className="h-4 w-4" />
                    {recommended.count}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                    Fit
                  </span>
                </div>
                <span className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">
                  Recommended
                </span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400">Passed benchmark</span>
              </div>
            )}
            {rejected && (
              <div className="flex min-w-[130px] flex-col gap-1 rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-rose-900 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-display text-xl font-bold tabular-nums text-rose-800 dark:text-rose-300">
                    <ThumbsDown className="h-4 w-4" />
                    {rejected.count}
                  </span>
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[9px] font-semibold text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">
                    Low
                  </span>
                </div>
                <span className="text-xs font-semibold text-rose-950 dark:text-rose-200">
                  Rejected
                </span>
                <span className="text-[10px] text-rose-700 dark:text-rose-400">Below threshold</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}


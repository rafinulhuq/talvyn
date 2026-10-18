"use client";

import { clsx } from "clsx";
import { Badge } from "@/components/ui/Badge";
import type { Evaluation } from "@/types/evaluation";

function ScoreRing({
  percentage,
  score,
  max,
}: {
  percentage: number;
  score: number;
  max: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-indigo-600 text-white p-5 shadow-xs min-w-36 shrink-0">
      <span className="font-display text-3xl font-bold tabular-nums tracking-tight">
        {percentage}%
      </span>
      <span className="text-xs font-medium text-indigo-100 mt-1">
        {score} / {max} pts
      </span>
    </div>
  );
}

function ScoreBreakdown({
  mcqScore,
  mcqMax,
  oeScore,
  oeMax,
}: {
  mcqScore: number;
  mcqMax: number;
  oeScore: number;
  oeMax: number;
}) {
  const mcqPct = mcqMax > 0 ? Math.round((mcqScore / mcqMax) * 100) : 0;
  const oePct = oeMax > 0 ? Math.round((oeScore / oeMax) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[
        { label: "MCQ Section", score: mcqScore, max: mcqMax, pct: mcqPct, color: "bg-indigo-600" },
        { label: "Open-Ended", score: oeScore, max: oeMax, pct: oePct, color: "bg-indigo-500" },
      ].map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {item.label}
            </span>
            <span className="text-xs font-medium text-slate-500">
              {item.score} / {item.max}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className={clsx("h-full rounded-full transition-all", item.color)}
              style={{ width: `${item.pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-right font-display text-xs font-bold text-slate-700 dark:text-slate-300">{item.pct}%</p>
        </div>
      ))}
    </div>
  );
}

export function ScoreOverview({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-4 font-display text-sm font-semibold text-slate-900 dark:text-slate-100">Overall Assessment Score</p>
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-6">
        <ScoreRing
          percentage={evaluation.percentage}
          score={evaluation.total_score}
          max={evaluation.max_score}
        />
        <div className="w-full flex-1">
          <ScoreBreakdown
            mcqScore={evaluation.mcq_score}
            mcqMax={evaluation.mcq_max}
            oeScore={evaluation.open_ended_score}
            oeMax={evaluation.open_ended_max}
          />
        </div>
      </div>
    </div>
  );
}


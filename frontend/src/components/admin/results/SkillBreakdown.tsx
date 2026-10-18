"use client";

import { BarChart2 } from "lucide-react";

export function SkillBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <BarChart2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Skill Performance Breakdown</p>
      </div>
      <div className="flex flex-col gap-3">
        {entries.map(([skill, pct]) => (
          <div key={skill}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="truncate font-medium text-slate-800 dark:text-slate-200">{skill}</span>
              <span className="ml-2 shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">
                {pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

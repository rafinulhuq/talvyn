"use client";

import { Star, TrendingDown } from "lucide-react";

export function StrengthsWeaknesses({
  strengths,
  weaknesses,
}: {
  strengths: string[];
  weaknesses: string[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {strengths.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <Star className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Strengths</p>
          </div>
          <ul className="flex flex-col gap-2">
            {strengths.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {weaknesses.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Weaknesses</p>
          </div>
          <ul className="flex flex-col gap-2">
            {weaknesses.map((w) => (
              <li key={w} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

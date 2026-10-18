"use client";

import { Lightbulb } from "lucide-react";

export function ImprovementSuggestionsList({ suggestions }: { suggestions: string[] }) {
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <Lightbulb className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">Suggested Improvement Areas</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {suggestions.map((s) => (
          <li key={s} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0">→</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

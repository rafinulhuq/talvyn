import { Check, X } from "lucide-react";
import type { HomeContent } from "@/lib/cms/content";

export function ComparisonSection({ content }: { content: HomeContent["comparison"] }) {
  return (
    <section id="comparison" className="border-b border-slate-300 bg-slate-50/50 py-24 font-sans text-slate-900 scroll-mt-20 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {content.eyebrow || "Technical Comparison & Paradigm Shift"}
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
            {content.title || "The Paradigm Shift"}
          </h2>
        </div>

        {/* Comparison Matrix Block */}
        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
          {/* Header Row */}
          <div className="grid grid-cols-3 border-b border-slate-300 bg-slate-100/70 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            <div className="p-4 sm:p-5 text-slate-500 uppercase tracking-wider dark:text-slate-400">
              Evaluation Vector
            </div>
            <div className="border-x border-slate-300 p-4 sm:p-5 text-center text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:text-slate-400">
              {content.oldLabel || "Legacy Interviewing"}
            </div>
            <div className="p-4 sm:p-5 text-center text-indigo-600 bg-indigo-50/50 font-bold uppercase tracking-wider dark:bg-indigo-950/30 dark:text-indigo-400">
              {content.newLabel || "Talvyn Platform"}
            </div>
          </div>

          {/* Matrix Rows */}
          {content.rows.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 border-b border-slate-200 dark:border-slate-800 text-xs transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/40 dark:bg-slate-850/40"
              }`}
            >
              <div className="p-4 sm:p-5 font-semibold text-slate-900 border-r border-slate-200 dark:border-slate-800 dark:text-white">
                {row.label}
              </div>
              <div className="flex items-center justify-center border-r border-slate-200 dark:border-slate-800 p-4 sm:p-5 text-center text-slate-500 font-normal dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <X className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  {row.old}
                </span>
              </div>
              <div className="flex items-center justify-center p-4 sm:p-5 text-center text-slate-900 font-semibold bg-indigo-50/20 dark:bg-indigo-950/10 dark:text-white">
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  {row.now}
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

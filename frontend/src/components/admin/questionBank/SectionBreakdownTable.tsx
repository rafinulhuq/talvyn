"use client";

import { clsx } from "clsx";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { SECTION_LABELS, SECTION_ORDER, type BankStatusResponse } from "@/types/exam";

export function SectionBreakdownTable({ sections }: { sections: BankStatusResponse["sections"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <th className="px-4 py-3.5">Section</th>
            <th className="px-4 py-3.5">MCQ</th>
            <th className="px-4 py-3.5">Written (CQ)</th>
            <th className="px-4 py-3.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {SECTION_ORDER.map((section) => {
            const s = sections[section];
            return (
              <tr key={section} className="text-xs transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{SECTION_LABELS[section]}</td>
                <td className="px-4 py-3.5 font-medium text-slate-600 dark:text-slate-400">{s?.mcq ?? 0}</td>
                <td className="px-4 py-3.5 font-medium text-slate-600 dark:text-slate-400">{s?.cq ?? 0}</td>
                <td className="px-4 py-3.5">
                  {!s ? (
                    <span className="text-slate-400">—</span>
                  ) : s.meets_commercial_recommended ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Commercial Ready
                    </span>
                  ) : s.meets_minimum ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-400">
                      <CheckCircle2 className="h-3 w-3" /> Minimum Met
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400">
                      <AlertCircle className="h-3 w-3" /> Below Minimum
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

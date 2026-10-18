/**
 * TestCard — displays a TestSummary as a clickable card.
 * Shows type badge, title, question counts, duration, status.
 */

import Link from "next/link";
import { Clock, ChevronRight, FileText } from "lucide-react";
import type { TestSummary } from "@/types/test";
import { TEST_TYPE_LABELS } from "@/types/test";

interface TestCardProps {
  test: TestSummary;
  jdId: string;
}

export function TestCard({ test, jdId }: TestCardProps) {
  const isApproved = test.status === "APPROVED";
  const isDraft = test.status === "DRAFT";

  return (
    <Link
      href={`/dashboard/jds/${jdId}/tests/${test.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-300">
          {TEST_TYPE_LABELS[test.test_type]}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {test.difficulty}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        {test.title}
      </h3>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          {test.mcq_count} MCQ
        </span>
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          {test.open_ended_count} Open
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          {test.duration_minutes} min
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          isApproved
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
            : isDraft
            ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
            : "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        }`}>
          {isApproved ? "Approved" : isDraft ? "Draft" : test.status}
        </span>
        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

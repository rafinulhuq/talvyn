"use client";

import { CheckCircle, ChevronDown, ChevronUp, Code2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { QuestionFeedback } from "@/types/evaluation";

type QuestionFeedbackHeaderProps = {
  feedback: QuestionFeedback;
  index: number;
  expanded: boolean;
  effectiveScore: number;
  pct: number;
  hasAdminScore: boolean;
  onToggle: () => void;
};

export function QuestionFeedbackHeader({
  feedback: fb,
  index,
  expanded,
  effectiveScore,
  pct,
  hasAdminScore,
  onToggle,
}: QuestionFeedbackHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        {index + 1}
      </span>
      <Badge
        variant={fb.question_type === "MCQ" ? "blue" : fb.question_type === "CODE" ? "default" : "purple"}
        className="text-[10px] shrink-0"
      >
        {fb.question_type === "MCQ" ? "MCQ" : fb.question_type === "CODE" ? (
          <span className="flex items-center gap-1"><Code2 className="h-3 w-3" />Code</span>
        ) : "Open-ended"}
      </Badge>
      <div className="flex-1 min-w-0">
        {fb.question_text && (
          <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{fb.question_text}</p>
        )}
      </div>
      {hasAdminScore && (
        <Badge variant="purple" className="text-[10px] shrink-0">Manually scored</Badge>
      )}
      {fb.question_type === "MCQ" ? (
        fb.is_correct ? (
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
        )
      ) : (
        <span className="text-xs font-semibold tabular-nums shrink-0 text-slate-700 dark:text-slate-300">
          {effectiveScore}/{fb.max_score}
        </span>
      )}
      <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900 dark:text-white">
        {pct}%
      </span>
      {expanded ? (
        <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
      ) : (
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
      )}
    </button>
  );
}

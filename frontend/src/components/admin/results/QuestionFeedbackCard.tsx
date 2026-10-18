"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { Evaluation, QuestionFeedback } from "@/types/evaluation";
import { QuestionFeedbackHeader } from "./QuestionFeedbackHeader";
import { QuestionAnswerDisplay } from "./QuestionAnswerDisplay";
import { AiLikenessSummary } from "./AiLikenessSummary";
import { CriteriaList } from "./CriteriaList";
import { AdminScoreOverride } from "./AdminScoreOverride";

type QuestionFeedbackCardProps = {
  feedback: QuestionFeedback;
  index: number;
  attemptId: string;
  onUpdate: (updated: Evaluation) => void;
};

export function QuestionFeedbackCard({
  feedback: fb,
  index,
  attemptId,
  onUpdate,
}: QuestionFeedbackCardProps) {
  const [expanded, setExpanded] = useState(false);

  const effectiveScore = fb.admin_awarded_score !== null && fb.admin_awarded_score !== undefined
    ? fb.admin_awarded_score
    : fb.awarded_score;
  const pct = fb.max_score > 0 ? Math.round((effectiveScore / fb.max_score) * 100) : 0;
  const hasAdminScore = fb.admin_awarded_score !== null && fb.admin_awarded_score !== undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <QuestionFeedbackHeader
        feedback={fb}
        index={index}
        expanded={expanded}
        effectiveScore={effectiveScore}
        pct={pct}
        hasAdminScore={hasAdminScore}
        onToggle={() => setExpanded((e) => !e)}
      />

      <div className={clsx(
        "border-t border-slate-100 dark:border-slate-800 px-5 pb-5 pt-4 flex-col gap-4 bg-slate-50/50 dark:bg-slate-850/40",
        expanded ? "flex" : "hidden print:flex"
      )}>
        <QuestionAnswerDisplay feedback={fb} />

        {fb.estimated_ai_percentage !== null && <AiLikenessSummary feedback={fb} />}

        {fb.matched_criteria.length > 0 && (
          <CriteriaList title="Matched Criteria" items={fb.matched_criteria} variant="matched" />
        )}
        {fb.missed_criteria.length > 0 && (
          <CriteriaList title="Missed Criteria" items={fb.missed_criteria} variant="missed" />
        )}

        <AdminScoreOverride feedback={fb} attemptId={attemptId} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

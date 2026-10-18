"use client";

import { Sparkles } from "lucide-react";
import type { Evaluation } from "@/types/evaluation";
import { AI_DETECTION_CONFIDENCE_CONFIG } from "@/types/evaluation";

export function AILikenessCard({ evaluation }: { evaluation: Evaluation }) {
  const percentage = evaluation.overall_ai_likeness_percentage;
  const hasWrittenAnswers =
    evaluation.open_ended_max > 0 ||
    evaluation.question_feedback.some((fb) => fb.question_type === "OPEN_ENDED");

  if (typeof percentage !== "number") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">AI-Likeness Signal</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            Not analyzed
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {hasWrittenAnswers
            ? "No AI-likeness estimate is stored for this report yet. Re-evaluate this attempt after the detector is enabled to populate it."
            : "This report has no written answers for the detector to analyze."}
        </p>
      </div>
    );
  }

  const confidenceCfg = evaluation.overall_ai_detection_confidence
    ? AI_DETECTION_CONFIDENCE_CONFIG[evaluation.overall_ai_detection_confidence]
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
        <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">AI-Likeness Estimate</p>
      </div>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <div className="flex flex-col items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 p-4 min-w-28 dark:bg-indigo-950/40 dark:border-indigo-900/40 shadow-xs">
          <span className="text-3xl font-extrabold font-display tabular-nums tracking-tight text-indigo-700 dark:text-indigo-300">{percentage}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 text-indigo-600/70 dark:text-indigo-400/70">AI Signal</span>
        </div>
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {confidenceCfg && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Confidence: {confidenceCfg.label}
              </span>
            )}
            {evaluation.flagged_answer_count > 0 && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
                {evaluation.flagged_answer_count} answer{evaluation.flagged_answer_count !== 1 ? "s" : ""} flagged for review
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            This is a probabilistic writing signal, not definitive proof of AI use. Use
            it as one review input alongside the candidate&apos;s full
            response and score. It does not automatically change the candidate&apos;s score.
          </p>
          {evaluation.overall_ai_detection_confidence === "LOW" && (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              Confidence is low — weigh this estimate less heavily than usual.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

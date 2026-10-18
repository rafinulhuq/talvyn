"use client";

import { Sparkles } from "lucide-react";
import {
  AI_DETECTION_CONFIDENCE_CONFIG,
  AI_DETECTION_RECOMMENDATION_CONFIG,
} from "@/types/evaluation";
import type { QuestionFeedback } from "@/types/evaluation";

type AiLikenessSummaryProps = {
  feedback: QuestionFeedback;
};

export function AiLikenessSummary({ feedback: fb }: AiLikenessSummaryProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-white">
          AI-Likeness: {fb.estimated_ai_percentage}%
        </p>
        {fb.ai_detection_confidence && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {AI_DETECTION_CONFIDENCE_CONFIG[fb.ai_detection_confidence].label}
          </span>
        )}
        {fb.ai_detection_recommendation && (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
            {AI_DETECTION_RECOMMENDATION_CONFIG[fb.ai_detection_recommendation].label}
          </span>
        )}
      </div>
      {fb.ai_detection_explanation && (
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{fb.ai_detection_explanation}</p>
      )}
      {fb.suspicious_phrases && fb.suspicious_phrases.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fb.suspicious_phrases.map((phrase) => (
            <span key={phrase} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-mono text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              &quot;{phrase}&quot;
            </span>
          ))}
        </div>
      )}
      {fb.ai_detection_confidence === "LOW" && (
        <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Confidence is low — weigh this estimate less heavily than usual.
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-slate-400">
        Probabilistic writing signal, not proof of AI use; does not change scoring.
      </p>
    </div>
  );
}

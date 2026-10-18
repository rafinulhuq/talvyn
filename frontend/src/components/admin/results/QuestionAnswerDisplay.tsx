"use client";

import { clsx } from "clsx";
import { CheckCircle, XCircle } from "lucide-react";
import type { QuestionFeedback } from "@/types/evaluation";

type QuestionAnswerDisplayProps = {
  feedback: QuestionFeedback;
};

export function QuestionAnswerDisplay({ feedback: fb }: QuestionAnswerDisplayProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {fb.question_text && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Question Prompt</p>
          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-normal">{fb.question_text}</p>
        </div>
      )}

      {fb.question_type === "MCQ" && fb.question_options && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Options &amp; Selection</p>
          <ul className="flex flex-col gap-2">
            {fb.question_options.map((opt) => {
              const isChosen = opt.label === fb.candidate_answer;
              const isCorrect = opt.is_correct;
              return (
                <li
                  key={opt.label}
                  className={clsx(
                    "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-xs transition-colors",
                    isCorrect && isChosen
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : isCorrect
                      ? "border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300"
                      : isChosen
                      ? "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                      : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  )}
                >
                  <span className="font-bold shrink-0 w-4 text-slate-400">{opt.label}.</span>
                  <span className="flex-1">{opt.text}</span>
                  {isCorrect && (
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  {isChosen && !isCorrect && (
                    <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  )}
                  {isChosen && (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 shrink-0">
                      Candidate Choice
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {fb.question_type === "OPEN_ENDED" && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Candidate Answer</p>
          {fb.candidate_answer ? (
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3.5 py-3 shadow-xs">
              {fb.candidate_answer}
            </p>
          ) : (
            <p className="text-xs text-slate-400 italic">No answer provided</p>
          )}
        </div>
      )}

      {fb.question_type === "CODE" && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Code Submission</p>
          {fb.candidate_answer ? (
            <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-100 font-mono leading-relaxed shadow-xs">
              {fb.candidate_answer}
            </pre>
          ) : (
            <p className="text-xs text-slate-400 italic">No code submitted</p>
          )}
        </div>
      )}

      {fb.ai_feedback && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">AI Evaluation Feedback</p>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed rounded-xl border border-indigo-100 bg-indigo-50/50 dark:border-indigo-900/50 dark:bg-indigo-950/30 px-3.5 py-3 shadow-xs">
            {fb.ai_feedback}
          </p>
        </div>
      )}
    </div>
  );
}

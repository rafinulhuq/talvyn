"use client";

import { clsx } from "clsx";
import { Badge } from "@/components/ui/Badge";
import type { QuestionForCandidate } from "@/types/attempt";

const MAX_CHARS = 10_000;

interface OpenEndedQuestionProps {
  question: QuestionForCandidate;
  value: string;
  onChange: (questionId: string, text: string) => void;
  disabled?: boolean;
  index: number;
}

export function OpenEndedQuestion({
  question,
  value,
  onChange,
  disabled = false,
  index,
}: OpenEndedQuestionProps) {
  const charCount = value.length;
  const wordCount = value.trim()
    ? value.trim().split(/\s+/).length
    : 0;
  const nearLimit = charCount > MAX_CHARS * 0.9;

  return (
    <div className="flex flex-col gap-4 text-slate-900 dark:text-slate-100">
      {/* Question header */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-xs">
            Q{index + 1}
          </span>
          {question.skill_tested && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {question.skill_tested}
            </span>
          )}
        </div>
        <p className="text-base font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
          {question.question_text}
        </p>
      </div>

      {/* Marks hint */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        This question is worth{" "}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{question.marks} marks</span>.
        Provide a clear, structured, and comprehensive response.
      </p>

      {/* Modern Textarea */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(question.id, e.target.value.slice(0, MAX_CHARS))}
          disabled={disabled}
          placeholder="Type your structured response here..."
          rows={9}
          className={clsx(
            "w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed shadow-xs transition-colors",
            "text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500",
            "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
            "dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500",
            nearLimit && "border-amber-500 ring-1 ring-amber-500"
          )}
          aria-label={`Answer for question ${index + 1}`}
          aria-describedby={`q-${question.id}-counter`}
        />
      </div>

      {/* Counter */}
      <div
        id={`q-${question.id}-counter`}
        className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums"
      >
        <span>
          {wordCount} word{wordCount !== 1 ? "s" : ""}
        </span>
        <span
          className={clsx(
            nearLimit && "font-semibold text-amber-600 dark:text-amber-400"
          )}
        >
          {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
          {nearLimit && " (approaching limit)"}
        </span>
      </div>
    </div>
  );
}

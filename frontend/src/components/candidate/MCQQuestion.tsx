"use client";

import { useEffect, useEffectEvent, useId } from "react";
import { clsx } from "clsx";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { QuestionForCandidate } from "@/types/attempt";

interface MCQQuestionProps {
  question: QuestionForCandidate;
  selectedOption: string | null;
  onChange: (questionId: string, option: string) => void;
  disabled?: boolean;
  index: number;
}

const KEY_MAP: Record<string, string> = {
  "1": "A", "2": "B", "3": "C", "4": "D",
  a: "A", b: "B", c: "C", d: "D",
};

export function MCQQuestion({
  question,
  selectedOption,
  onChange,
  disabled = false,
  index,
}: MCQQuestionProps) {
  const questionLabelId = useId();

  const onKeydown = useEffectEvent((e: KeyboardEvent) => {
    if (disabled) return;
    if (e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLInputElement) return;
    const option = KEY_MAP[e.key.toLowerCase()];
    if (option && question.options?.find((o) => o.label === option)) {
      onChange(question.id, option);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  return (
    <div className="flex flex-col gap-5 text-slate-900 dark:text-slate-100">
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

      {/* Options grid */}
      <div
        className="flex flex-col gap-3"
        role="radiogroup"
        aria-labelledby={questionLabelId}
      >
        {(question.options ?? []).map((opt) => {
          const isSelected = selectedOption === opt.label;
          return (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(question.id, opt.label)}
              className={clsx(
                "group flex items-start gap-3.5 rounded-xl border p-4 text-left transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? "border-indigo-600 bg-indigo-50/70 text-slate-900 shadow-xs dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-slate-100"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-850"
              )}
            >
              {/* Option label indicator */}
              <span
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold transition-colors",
                  isSelected
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "border border-slate-300 bg-slate-50 text-slate-700 group-hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                {opt.label}
              </span>

              {/* Option description text */}
              <span className="flex-1 text-sm leading-relaxed font-medium">
                {opt.text}
              </span>

              {/* Selection Check icon */}
              {isSelected && (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400 animate-scale-in" />
              )}
            </button>
          );
        })}
      </div>

      {/* Keyboard helper hint */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Tip: Press <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">1</kbd>–<kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">4</kbd> or <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">A</kbd>–<kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">D</kbd> to select an answer.
      </p>
    </div>
  );
}

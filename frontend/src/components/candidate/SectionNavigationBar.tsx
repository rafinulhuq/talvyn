"use client";

import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { LocalAnswerMap, QuestionForCandidate } from "@/types/attempt";

type SectionNavigationBarProps = {
  questions: QuestionForCandidate[];
  answers: LocalAnswerMap;
  currentIndex: number;
  isSubmitting: boolean;
  sectionIndex: number;
  totalSections: number;
  onPrevious: () => void;
  onNext: () => void;
  onJumpTo: (index: number) => void;
  onSubmitClick: () => void;
};

export function SectionNavigationBar({
  questions,
  answers,
  currentIndex,
  isSubmitting,
  sectionIndex,
  totalSections,
  onPrevious,
  onNext,
  onJumpTo,
  onSubmitClick,
}: SectionNavigationBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={currentIndex === 0 || isSubmitting}
        onClick={onPrevious}
        leftIcon={<ChevronLeft className="h-4 w-4" />}
      >
        Previous
      </Button>

      {/* Question quick jump dots */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {questions.map((q, i) => {
          const isAnswered = Boolean(answers[q.id]);
          const isCurrent = i === currentIndex;
          return (
            <button
              key={q.id}
              onClick={() => onJumpTo(i)}
              disabled={isSubmitting}
              aria-label={`Question ${i + 1}${isAnswered ? " (answered)" : ""}`}
              className={clsx(
                "h-8 w-8 rounded-lg text-xs font-semibold tabular-nums transition-all",
                isCurrent
                  ? "bg-indigo-600 text-white shadow-xs"
                  : isAnswered
                  ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-950/40 dark:text-indigo-400"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {currentIndex < questions.length - 1 ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={isSubmitting}
          onClick={onNext}
          rightIcon={<ChevronRight className="h-4 w-4" />}
        >
          Next
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          disabled={isSubmitting}
          onClick={onSubmitClick}
          rightIcon={<Send className="h-3.5 w-3.5" />}
        >
          {sectionIndex + 1 < totalSections ? "Complete Section" : "Submit Exam"}
        </Button>
      )}
    </div>
  );
}

/**
 * SubmitConfirm — modal-style overlay before submitting.
 * Shows unanswered count, asks for confirmation.
 */

"use client";

import { clsx } from "clsx";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SubmitConfirmProps {
  totalQuestions: number;
  answeredQuestions: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function SubmitConfirm({
  totalQuestions,
  answeredQuestions,
  onConfirm,
  onCancel,
  isSubmitting,
}: SubmitConfirmProps) {
  const unanswered = totalQuestions - answeredQuestions;
  const allAnswered = unanswered === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs animate-fade-backdrop motion-reduce:animate-none">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-fade-in motion-reduce:animate-none">
        {/* Icon */}
        <div
          className={clsx(
            "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl",
            allAnswered
              ? "bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-600/10 dark:bg-indigo-950/40 dark:text-indigo-400"
              : "bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400"
          )}
        >
          {allAnswered ? (
            <CheckCircle className="h-6 w-6" />
          ) : (
            <AlertTriangle className="h-6 w-6" />
          )}
        </div>

        {/* Title */}
        <h2 className="text-center text-lg font-bold text-slate-900 dark:text-slate-100">
          Submit Assessment?
        </h2>

        {/* Body */}
        <div className="mt-2.5 text-center">
          {allAnswered ? (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              You&apos;ve answered all {totalQuestions} questions. Once submitted, answers cannot be edited.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              You have{" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400 underline">
                {unanswered} unanswered question{unanswered !== 1 ? "s" : ""}
              </span>
              . Unanswered items receive zero marks.
            </p>
          )}
        </div>

        {/* Progress summary */}
        <div className="mt-5 flex items-center justify-around rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{answeredQuestions}</p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Answered</p>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="text-center">
            <p className={clsx("text-lg font-bold", unanswered > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100")}>
              {unanswered}
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Pending</p>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{totalQuestions}</p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Review
          </Button>
          <Button
            className="flex-1"
            onClick={onConfirm}
            loading={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Confirm & Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}

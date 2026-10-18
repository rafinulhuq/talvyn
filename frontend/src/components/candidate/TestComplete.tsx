/**
 * TestComplete — shown after successful submission.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle, Clock, Loader2 } from "lucide-react";
import { attemptsApi } from "@/lib/api/attempts";
import type { SubmitAttemptResponse } from "@/types/attempt";

interface TestCompleteProps {
  result: SubmitAttemptResponse;
  testTitle: string;
}

export function TestComplete({ result, testTitle }: TestCompleteProps) {
  const router = useRouter();
  const [startingNext, setStartingNext] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);

  const submittedAt = new Date(result.submitted_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pct =
    result.total_questions > 0
      ? Math.round((result.answered_questions / result.total_questions) * 100)
      : 0;
  const hasNextTest = result.next_test_index !== null && result.next_test_index !== undefined;

  async function handleStartNext() {
    if (!hasNextTest) return;
    setStartingNext(true);
    setNextError(null);
    try {
      const attempt = await attemptsApi.start({
        test_index: result.next_test_index!,
      });
      router.push(`/tests/session/exam?attempt=${attempt.attempt_id}`);
    } catch {
      setNextError(
        "We couldn't start the next test just now. Please open the link from your invitation email again to continue."
      );
      setStartingNext(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center font-sans">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400">
        <CheckCircle className="h-8 w-8" />
      </div>

      {/* Heading */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Assessment Submitted
        </h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          {testTitle}
        </p>
      </div>

      {/* Summary card */}
      <div className="w-full max-w-sm rounded-xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/5 divide-y divide-slate-200 overflow-hidden text-left dark:border-slate-800 dark:bg-slate-900 dark:divide-slate-800">
        <div className="flex items-center justify-between px-5 py-3 text-xs">
          <span className="font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">Submitted At</span>
          <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
            <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            {submittedAt}
          </span>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-xs">
          <span className="font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">Completed</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            {result.answered_questions} / {result.total_questions}
            <span className="ml-1.5 text-slate-400 font-normal">({pct}%)</span>
          </span>
        </div>
        {result.auto_submitted && (
          <div className="flex items-center justify-between px-5 py-3 text-xs">
            <span className="font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">Type</span>
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              Auto-Submitted (Timer)
            </span>
          </div>
        )}
      </div>

      {/* What's next */}
      <div className="w-full max-w-sm rounded-xl border border-slate-300 bg-white p-5 text-left shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold tracking-wide text-slate-900 mb-3 dark:text-white">What happens next</p>
        {hasNextTest ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You still have test {result.next_test_index! + 1} of {result.total_tests} remaining.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {[
              "Your answers are being reviewed by the hiring team.",
              "Results are typically shared within a few business days.",
              "This link is now inactive and cannot be reused.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {nextError && (
        <div className="flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-left text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-xs font-medium">{nextError}</p>
        </div>
      )}

      {hasNextTest && (
        <button
          onClick={handleStartNext}
          disabled={startingNext}
          className="flex w-full max-w-sm items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:cursor-not-allowed disabled:opacity-40"
        >
          {startingNext ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Starting next test…</span>
            </>
          ) : (
            <>
              <span>Continue to Test {result.next_test_index! + 1} of {result.total_tests}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      )}

      <p className="text-xs text-slate-500 max-w-xs dark:text-slate-400">
        {hasNextTest
          ? "You can continue now, or come back to the same email link later."
          : "You can safely close this window. Good luck!"}
      </p>
    </div>
  );
}

/**
 * TestTerminated — shown when an attempt/invitation has been hard-terminated
 * for an exam-integrity violation (tab switch, window blur, leaving the exam
 * window). Unlike TestComplete, there is never a "next test" option here —
 * termination blocks every remaining test in the invitation.
 */

"use client";

import { ShieldX } from "lucide-react";

interface TestTerminatedProps {
  testTitle?: string;
  reason?: string | null;
}

const REASON_LABELS: Record<string, string> = {
  TAB_SWITCH: "switching tabs",
  WINDOW_BLUR: "leaving the exam window",
  VISIBILITY_HIDDEN: "leaving the exam window",
  FULLSCREEN_EXIT: "exiting fullscreen",
};

export function TestTerminated({ testTitle, reason }: TestTerminatedProps) {
  const reasonLabel = reason ? REASON_LABELS[reason] : null;

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center font-sans">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400">
        <ShieldX className="h-8 w-8" />
      </div>

      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Assessment Ended</h1>
        {testTitle && <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">{testTitle}</p>}
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-300 bg-white p-5 text-left shadow-sm ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-300">
          This assessment was ended because the exam window was left or
          another tab/window was opened
          {reasonLabel ? ` (${reasonLabel})` : ""}. For fairness, remaining
          tests in this invitation are no longer available.
        </p>
      </div>

      <p className="text-xs text-slate-500 max-w-xs dark:text-slate-400">
        If you believe this happened in error, contact whoever invited you to
        this assessment.
      </p>
    </div>
  );
}

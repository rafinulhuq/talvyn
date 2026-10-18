/**
 * StartExamButton (Master Prompt 2/3 sectioned exam)
 *
 * Mirrors StartTestButton:
 *   1. Calls POST /api/v1/candidate-exams/start (the candidate proxy
 *      injects the magic-link token from the httpOnly session cookie —
 *      A8-4; assigns locked questions from the bank on first call,
 *      idempotent on retry)
 *   2. Redirects to /exam/session/section?attempt=<exam_attempt_id>
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { isAxiosError } from "axios";
import { candidateExamsApi } from "@/lib/api/candidateExams";
import { AssessmentIntegrityNotice } from "@/components/candidate/AssessmentIntegrityNotice";

export function StartExamButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  async function handleStart() {
    if (!acknowledged) return;
    setLoading(true);
    setError(null);

    try {
      const section = await candidateExamsApi.start();
      router.push(`/exam/session/section?attempt=${section.exam_attempt_id}`);
    } catch (err: unknown) {
      setLoading(false);
      const body = isAxiosError<{ detail?: unknown; error?: { message?: unknown } }>(err)
        ? err.response?.data
        : undefined;
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const detail =
        typeof body?.detail === "string"
          ? body.detail
          : typeof body?.error?.message === "string"
            ? body.error.message
            : undefined;
      if (status === 409 && typeof detail === "string") {
        // ConflictError from create_or_resume_exam_for_token — e.g.
        // "No ready question bank exists for this job yet."
        setError(detail);
      } else if (status === 409) {
        setError("This assessment has already been submitted.");
      } else if ((status === 403 || status === 400 || status === 401) && typeof detail === "string") {
        setError(detail);
      } else if (status === 401) {
        setError("This link is no longer valid. Please open the link from your invitation email again.");
      } else {
        setError("We couldn't start the assessment just now. Please try again in a moment.");
      }
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col items-center gap-5 text-center dark:border-slate-800 dark:bg-slate-900">
      <AssessmentIntegrityNotice
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
        warning="To keep this assessment fair, copy/paste is disabled. Leaving this browser tab or switching windows will immediately end the assessment. Your answers autosave automatically as you work."
      />

      <p className="text-xs text-slate-500 dark:text-slate-400">
        When you&apos;re ready, click the button below. The timer for the first section starts immediately.
      </p>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-left w-full text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-xs font-medium">{error}</p>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={loading || !acknowledged}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-6 py-4 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 active:scale-[0.99] transition-all disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Starting assessment…</span>
          </>
        ) : (
          <>
            <span>Start Assessment Now</span>
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}

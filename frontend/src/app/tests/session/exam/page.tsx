/**
 * Exam page — full timed test-taking interface.
 *
 * Route: /tests/session/exam?attempt=<attemptId>
 *
 * This page is a pure client component — no server render.
 * On mount it loads the attempt state from the API (resume support).
 * Timer, autosave, suspicious events all run client-side.
 *
 * The magic-link token never reaches this page (A8-4): it lives in an
 * httpOnly cookie and the /api/candidate proxy injects it upstream.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Send, Loader2, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/Button";
import { TestTimer } from "@/components/candidate/TestTimer";
import { ProgressBar } from "@/components/candidate/ProgressBar";
import { MCQQuestion } from "@/components/candidate/MCQQuestion";
import { OpenEndedQuestion } from "@/components/candidate/OpenEndedQuestion";
import { CodeQuestion } from "@/components/candidate/CodeQuestion";
import { SubmitConfirm } from "@/components/candidate/SubmitConfirm";
import { TestComplete } from "@/components/candidate/TestComplete";
import { TestTerminated } from "@/components/candidate/TestTerminated";
import { useTestTimer } from "@/hooks/useTestTimer";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useSuspiciousEvents } from "@/hooks/useSuspiciousEvents";
import { attemptsApi } from "@/lib/api/attempts";
import { sortQuestions } from "@/lib/questionSort";
import type {
  LocalAnswerMap,
  QuestionForCandidate,
  SubmitAttemptResponse,
  SuspiciousEventType,
} from "@/types/attempt";

// ── Page ──────────────────────────────────────────────────────

export default function ExamPage() {
  const searchParams = useSearchParams();

  const attemptId = searchParams.get("attempt") ?? "";

  // ── Loading state ─────────────────────────────────────────
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Test data ─────────────────────────────────────────────
  const [testTitle, setTestTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionForCandidate[]>([]);
  const [initialSeconds, setInitialSeconds] = useState(0);

  // ── Answer tracking ───────────────────────────────────────
  const [answers, setAnswers] = useState<LocalAnswerMap>({});

  // ── Navigation ────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);

  // ── UI states ─────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitAttemptResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Integrity enforcement ──────────────────────────────────
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);
  const [blockedToast, setBlockedToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Guard against double submit ────────────────────────────
  const hasSubmittedRef = useRef(false);
  const lastAutoSubmittedRef = useRef(false);

  // ── Load attempt state on mount ───────────────────────────
  useEffect(() => {
    if (!attemptId) {
      setLoadError(
        "We couldn't find your test. Please open the link from your invitation email again."
      );
      setLoadState("error");
      return;
    }

    hasSubmittedRef.current = false;
    setLoadState("loading");
    setLoadError(null);
    setSubmitResult(null);
    setSubmitError(null);
    setTerminatedReason(null);
    setQuestions([]);
    setAnswers({});
    setCurrentIndex(0);
    setInitialSeconds(0);

    attemptsApi.getState(attemptId).then((state) => {
      if (state.status === "TERMINATED") {
        // Covers refresh-after-termination and reopening the link — the
        // violation already happened in a prior session, just render the
        // terminal screen instead of resuming the exam.
        setTestTitle(state.test_title);
        setTerminatedReason(state.integrity_violation_reason ?? "");
        setLoadState("ready");
        return;
      }

      if (state.status === "SUBMITTED" || state.status === "EVALUATED") {
        // Already submitted (and possibly already evaluated) — show complete screen
        setSubmitResult({
          attempt_id: attemptId,
          submitted_at: new Date().toISOString(),
          total_questions: state.questions.length,
          answered_questions: Object.keys(state.saved_answers).length,
          auto_submitted: false,
          message: "Already submitted.",
          next_test_index: null,
          total_tests: 0,
        });
        setTestTitle(state.test_title);
        setLoadState("ready");
        return;
      }

      setTestTitle(state.test_title);
      setQuestions(sortQuestions(state.questions));
      setInitialSeconds(state.server_time_remaining_seconds);
      setAnswers(state.saved_answers);
      setLoadState("ready");
    }).catch((err) => {
      const status = err?.response?.status;

      if (status === 403 || status === 400 || status === 401) {
        // Stale/rotated or revoked invitation link — reloading won't help here,
        // so don't tell candidates to "try again."
        setLoadError(
          "This link isn't active anymore — it may have been replaced by a more recent invitation. Please check your email for the latest link, or reach out to whoever invited you."
        );
      } else if (status === 404) {
        setLoadError(
          "We couldn't find your test. Please open the link from your invitation email again."
        );
      } else {
        setLoadError(
          "We're having trouble opening your test right now. This isn't something you did wrong — please try reloading the page in a moment."
        );
      }
      setLoadState("error");
    });
  }, [attemptId]);

  // ── Handle answer change ──────────────────────────────────
  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    []
  );

  const isActive = loadState === "ready" && !submitResult && !terminatedReason;

  const { lastSavedAt, isSaving, saveError, isOnline, saveNow } = useAutoSave({
    attemptId,
    answers,
    enabled: isActive,
  });

  // ── Submit function ───────────────────────────────────────
  const doSubmit = useCallback(
    async (autoSubmitted = false) => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;
      lastAutoSubmittedRef.current = autoSubmitted;
      setIsSubmitting(true);
      setShowConfirm(false);
      setSubmitError(null);

      // Flush autosave first
      await saveNow();

      // Build final answers payload
      const finalAnswers = Object.entries(answers).map(([qId, val]) => {
        const isOption = ["A", "B", "C", "D"].includes(val);
        return {
          question_id: qId,
          selected_option: isOption ? (val as "A" | "B" | "C" | "D") : null,
          answer_text: isOption ? null : val || null,
        };
      });

      try {
        const result = await attemptsApi.submit(attemptId, {
          answers: finalAnswers,
          auto_submitted: autoSubmitted,
        });
        setSubmitResult(result);
      } catch {
        // The submit never reached the server — don't claim success.
        // Your answers are already autosaved, so it's safe to let the
        // candidate retry instead of showing a fake completion screen.
        hasSubmittedRef.current = false;
        setSubmitError(
          "We couldn't submit your test — your answers are saved. Please check your connection and try again."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [answers, attemptId, saveNow]
  );

  // ── Timer expiry → auto-submit ────────────────────────────
  const handleTimerExpire = useCallback(() => {
    if (!hasSubmittedRef.current) {
      doSubmit(true);
    }
  }, [doSubmit]);

  // ── Integrity violation → hard termination ─────────────────
  // Locks the UI immediately, client-side — a cheating candidate shouldn't
  // get a free window while the terminate request is in flight. The API
  // call itself retries once on network failure (see attemptsApi.terminate);
  // either way the UI stays locked once this fires.
  const handleViolation = useCallback(
    (reason: SuspiciousEventType) => {
      setTerminatedReason(reason);
      attemptsApi.terminate(attemptId, { reason });
    },
    [attemptId]
  );

  const handleBlocked = useCallback((message: string) => {
    setBlockedToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setBlockedToast(null), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // ── Hooks ─────────────────────────────────────────────────
  const { urgency, formatted } = useTestTimer({
    attemptId,
    initialSeconds,
    onExpire: handleTimerExpire,
    enabled: isActive && initialSeconds > 0,
  });

  useSuspiciousEvents({
    attemptId,
    enabled: isActive,
    onViolation: handleViolation,
    onBlocked: handleBlocked,
  });

  // ── Derived values ────────────────────────────────────────
  const answeredCount = Object.keys(answers).filter((k) =>
    questions.some((q) => q.id === k)
  ).length;

  const currentQuestion = questions[currentIndex];

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <AlertCircle className="h-10 w-10 text-danger" />
        <div>
          <p className="text-sm font-semibold text-slate-900">We hit a snag opening your test</p>
          <p className="mt-1 text-sm text-slate-500">{loadError}</p>
        </div>
        <Button onClick={() => window.location.reload()} variant="secondary" size="sm">
          Reload page
        </Button>
      </div>
    );
  }

  // Terminated state — integrity violation, this and every other remaining
  // test in the invitation are blocked. Checked before submitResult since a
  // terminated attempt was never submitted.
  if (terminatedReason !== null) {
    return <TestTerminated testTitle={testTitle} reason={terminatedReason} />;
  }

  // Submitted state
  if (submitResult) {
    return <TestComplete result={submitResult} testTitle={testTitle} />;
  }

  // Active test
  return (
    <div className="flex flex-col gap-0">
      {/* ── Blocked-action toast ───────────────────────────── */}
      {blockedToast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg animate-fade-in motion-reduce:animate-none">
          {blockedToast}
        </div>
      )}

      {/* ── Sticky header ─────────────────────────────────── */}
      <div className="sticky top-14 z-10 -mx-6 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{testTitle}</p>
            <div className="mt-1.5">
              <ProgressBar
                current={currentIndex}
                total={questions.length}
                answered={answeredCount}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Save status */}
            <span
              className={clsx(
                "hidden text-xs sm:block",
                !isOnline ? "text-warning-dark" : saveError ? "text-danger" : "text-slate-400"
              )}
            >
              {isSaving
                ? "Saving…"
                : !isOnline
                ? "Offline - answers will retry"
                : saveError
                ? "Couldn't save — retrying…"
                : lastSavedAt
                ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
            <TestTimer formatted={formatted} urgency={urgency} />
          </div>
        </div>
      </div>

      {/* ── Question card ──────────────────────────────────── */}
      <div className="card my-6 p-6">
        {currentQuestion?.question_type === "MCQ" ? (
          <MCQQuestion
            question={currentQuestion}
            selectedOption={answers[currentQuestion.id] ?? null}
            onChange={handleAnswerChange}
            disabled={isSubmitting}
            index={currentIndex}
          />
        ) : currentQuestion?.question_type === "CODE" ? (
          <CodeQuestion
            question={currentQuestion}
            value={answers[currentQuestion.id] ?? (currentQuestion.code_starter ?? "")}
            onChange={handleAnswerChange}
            disabled={isSubmitting}
            index={currentIndex}
          />
        ) : (
          <OpenEndedQuestion
            question={currentQuestion!}
            value={answers[currentQuestion!.id] ?? ""}
            onChange={handleAnswerChange}
            disabled={isSubmitting}
            index={currentIndex}
          />
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={currentIndex === 0 || isSubmitting}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          leftIcon={<ChevronLeft className="h-4 w-4" />}
        >
          Previous
        </Button>

        {/* Question dots */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {questions.map((q, i) => {
            const isAnswered = Boolean(answers[q.id]);
            const isCurrent = i === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                disabled={isSubmitting}
                aria-label={`Question ${i + 1}${isAnswered ? " (answered)" : ""}`}
                className={clsx(
                  "h-6 w-6 rounded-full text-xs font-medium transition-all",
                  isCurrent
                    ? "bg-brand-500 text-slate-950 ring-2 ring-brand-300 ring-offset-1"
                    : isAnswered
                    ? "bg-brand-100 text-brand-700 hover:bg-brand-200"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
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
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            rightIcon={<ChevronRight className="h-4 w-4" />}
          >
            Next
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={() => setShowConfirm(true)}
            leftIcon={<Send className="h-4 w-4" />}
          >
            Submit
          </Button>
        )}
      </div>

      {/* Submit failure — answers are safe, but nothing reached the server */}
      {submitError && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3 text-center sm:flex-row sm:justify-between">
          <p className="text-sm font-semibold text-danger-dark">{submitError}</p>
          <Button
            size="sm"
            disabled={isSubmitting}
            onClick={() => doSubmit(lastAutoSubmittedRef.current)}
            leftIcon={<Send className="h-4 w-4" />}
          >
            Retry submit
          </Button>
        </div>
      )}

      {/* Urgency banner */}
      {urgency === "critical" && !isSubmitting && (
        <div className="mt-4 rounded-xl border border-danger/20 bg-danger-light px-4 py-3 text-center">
          <p className="text-sm font-semibold text-danger-dark">
            ⚠ Less than 1 minute remaining — submit now!
          </p>
        </div>
      )}

      {/* ── Confirm dialog ─────────────────────────────────── */}
      {showConfirm && (
        <SubmitConfirm
          totalQuestions={questions.length}
          answeredQuestions={answeredCount}
          onConfirm={() => doSubmit(false)}
          onCancel={() => setShowConfirm(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

/**
 * Sectioned exam — active section-taking page (Master Prompt 2/3).
 *
 * Route: /exam/session/section?attempt=<exam_attempt_id>
 * The magic-link token never reaches this page (A8-4): it lives in an
 * httpOnly cookie and the /api/candidate proxy injects it upstream.
 *
 * Mirrors tests/session/exam/page.tsx closely: same timer/autosave/
 * suspicious-event hooks, reused unchanged, because each section is backed
 * by a real TestAttempt with the exact same id/token mechanics as the
 * legacy single-test flow (see exam_attempt_service.start_or_resume_current_section).
 * Only section *transitions* are new: submitting a section either loads the
 * next one in place, or — once all 3 are done — shows the post-submission
 * status screen (SectionedExamComplete) instead of redirecting away.
 */

"use client";

import { Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SubmitConfirm } from "@/components/candidate/SubmitConfirm";
import { TestTerminated } from "@/components/candidate/TestTerminated";
import { SectionedExamComplete } from "@/components/candidate/SectionedExamComplete";
import { SectionLoadingSpinner, SectionedExamErrorState } from "@/components/candidate/SectionedExamStates";
import { SectionExamHeader } from "@/components/candidate/SectionExamHeader";
import { SectionQuestionCard } from "@/components/candidate/SectionQuestionCard";
import { SectionNavigationBar } from "@/components/candidate/SectionNavigationBar";
import { useTestTimer } from "@/hooks/useTestTimer";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useSuspiciousEvents } from "@/hooks/useSuspiciousEvents";
import { attemptsApi } from "@/lib/api/attempts";
import { candidateExamsApi } from "@/lib/api/candidateExams";
import { sortQuestions } from "@/lib/questionSort";
import type { LocalAnswerMap, QuestionForCandidate, SuspiciousEventType } from "@/types/attempt";
import type { ExamSectionResponse, SectionType } from "@/types/exam";

// The section-load lifecycle updates these seven values together — either
// resetting them when a new section starts loading, or setting them all at
// once when the load succeeds — so they're grouped into one reducer action
// instead of a run of separate setters that could drift out of sync.
interface SectionLoadState {
  loadState: "loading" | "ready" | "error";
  loadError: string | null;
  section: ExamSectionResponse | null;
  testTitle: string;
  questions: QuestionForCandidate[];
  initialSeconds: number;
  answers: LocalAnswerMap;
}

const initialSectionLoadState: SectionLoadState = {
  loadState: "loading",
  loadError: null,
  section: null,
  testTitle: "",
  questions: [],
  initialSeconds: 0,
  answers: {},
};

type SectionLoadAction =
  | { type: "loadStarted" }
  | { type: "loadSucceeded"; data: ExamSectionResponse }
  | { type: "loadFailed"; error: string }
  | { type: "loadReady" }
  | { type: "answerChanged"; questionId: string; value: string };

function sectionLoadReducer(state: SectionLoadState, action: SectionLoadAction): SectionLoadState {
  switch (action.type) {
    case "loadStarted":
      return { ...state, loadState: "loading", loadError: null, questions: [], answers: {}, initialSeconds: 0 };
    case "loadSucceeded":
      return {
        ...state,
        loadState: "ready",
        section: action.data,
        testTitle: action.data.test_title,
        questions: sortQuestions(action.data.questions),
        initialSeconds: action.data.duration_seconds,
        answers: action.data.saved_answers,
      };
    case "loadFailed":
      return { ...state, loadState: "error", loadError: action.error };
    case "loadReady":
      return { ...state, loadState: "ready" };
    case "answerChanged":
      return { ...state, answers: { ...state.answers, [action.questionId]: action.value } };
    default:
      return state;
  }
}

// Computes which terminal/loading screen (if any) should replace the main
// exam UI. Not a component: it owns no state and calls no hooks, so it's a
// plain conditional-dispatch helper, not the thing the "one giant component"
// complexity rule is aimed at.
function renderSectionStatus(props: {
  loadState: SectionLoadState["loadState"];
  loadError: string | null;
  terminatedReason: string | null;
  testTitle: string;
  examDone: boolean;
  examAttemptId: string;
  ready: boolean;
}) {
  if (props.loadState === "loading") return <SectionLoadingSpinner />;
  if (props.loadState === "error") {
    return (
      <SectionedExamErrorState loadError={props.loadError} onReload={() => window.location.reload()} />
    );
  }
  if (props.terminatedReason !== null) {
    return <TestTerminated testTitle={props.testTitle} reason={props.terminatedReason} />;
  }
  if (props.examDone) {
    return <SectionedExamComplete examAttemptId={props.examAttemptId} />;
  }
  if (!props.ready) return <SectionLoadingSpinner />;
  return null;
}

function BlockedToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg animate-fade-in motion-reduce:animate-none">
      {message}
    </div>
  );
}

function SubmitErrorBanner({
  message,
  isSubmitting,
  onRetry,
}: {
  message: string | null;
  isSubmitting: boolean;
  onRetry: () => void;
}) {
  if (!message) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3 text-center sm:flex-row sm:justify-between">
      <p className="text-sm font-semibold text-danger-dark">{message}</p>
      <Button size="sm" disabled={isSubmitting} onClick={onRetry} leftIcon={<Send className="h-4 w-4" />}>
        Retry submit
      </Button>
    </div>
  );
}

function TimeCriticalBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mt-4 rounded-xl border border-danger/20 bg-danger-light px-4 py-3 text-center">
      <p className="text-sm font-semibold text-danger-dark">
        ⚠ Less than 1 minute remaining — submit now!
      </p>
    </div>
  );
}

function SectionedExamPageContent() {
  const searchParams = useSearchParams();

  const examAttemptId = searchParams.get("attempt") ?? "";

  const [sectionLoad, dispatchSectionLoad] = useReducer(sectionLoadReducer, initialSectionLoadState);
  const { loadState, loadError, section, testTitle, questions, initialSeconds, answers } = sectionLoad;

  // ── Answer tracking ───────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);

  // ── UI states ─────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [examDone, setExamDone] = useState(false);

  // ── Integrity enforcement ──────────────────────────────────
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);
  const [blockedToast, setBlockedToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSubmittedRef = useRef(false);
  const lastAutoSubmittedRef = useRef(false);

  // ── Load the current section ──────────────────────────────
  const loadSection = useCallback(() => {
    if (!examAttemptId) {
      dispatchSectionLoad({
        type: "loadFailed",
        error: "We couldn't find your exam. Please open the link from your invitation email again.",
      });
      return;
    }

    hasSubmittedRef.current = false;
    dispatchSectionLoad({ type: "loadStarted" });
    setSubmitError(null);
    setTerminatedReason(null);
    setCurrentIndex(0);
    setShowConfirm(false);

    candidateExamsApi
      .getCurrentSection(examAttemptId)
      .then((data) => {
        dispatchSectionLoad({ type: "loadSucceeded", data });
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 409) {
          // Every section already submitted — show the post-submission screen.
          setExamDone(true);
          dispatchSectionLoad({ type: "loadReady" });
          return;
        }
        if (status === 403 || status === 400 || status === 401) {
          dispatchSectionLoad({
            type: "loadFailed",
            error:
              "This link isn't active anymore — it may have been replaced by a more recent invitation. Please check your email for the latest link, or reach out to whoever invited you.",
          });
        } else {
          dispatchSectionLoad({
            type: "loadFailed",
            error:
              "We're having trouble opening your exam right now. This isn't something you did wrong — please try reloading the page in a moment.",
          });
        }
      });
  }, [examAttemptId]);

  useEffect(() => {
    loadSection();
  }, [loadSection]);

  // ── Handle answer change ──────────────────────────────────
  const handleAnswerChange = useCallback((questionId: string, value: string) => {
    dispatchSectionLoad({ type: "answerChanged", questionId, value });
  }, []);

  // ── Hooks (operate on the section's underlying TestAttempt id) ─────
  const isActive = loadState === "ready" && !examDone && !terminatedReason && Boolean(section);
  const sectionAttemptId = section?.attempt_id ?? "";

  const { lastSavedAt, isSaving, saveError, isOnline, saveNow } = useAutoSave({
    attemptId: sectionAttemptId,
    answers,
    enabled: isActive,
  });

  // ── Submit current section ─────────────────────────────────
  const doSubmit = useCallback(
    async (autoSubmitted = false) => {
      if (!section || hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;
      lastAutoSubmittedRef.current = autoSubmitted;
      setIsSubmitting(true);
      setShowConfirm(false);
      setSubmitError(null);

      await saveNow();

      const finalAnswers = Object.entries(answers).map(([qId, val]) => {
        const isOption = ["A", "B", "C", "D"].includes(val);
        return {
          question_id: qId,
          selected_option: isOption ? (val as "A" | "B" | "C" | "D") : null,
          answer_text: isOption ? null : val || null,
        };
      });

      try {
        const result = await candidateExamsApi.submitSection(
          examAttemptId,
          section.section_type as SectionType,
          finalAnswers,
          autoSubmitted
        );

        if (result.next_section_type) {
          // Load the next section in place — no full page navigation needed.
          loadSection();
        } else {
          // All 3 sections done — confirm final submission, then show status screen.
          await candidateExamsApi.submitExam(examAttemptId).catch(() => {
            // Non-fatal — section submission already succeeded, the status
            // screen's own polling will reflect the real state regardless.
          });
          setExamDone(true);
        }
      } catch {
        hasSubmittedRef.current = false;
        setSubmitError(
          "We couldn't submit this section — your answers are saved. Please check your connection and try again."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [answers, examAttemptId, section, loadSection, saveNow]
  );

  const handleTimerExpire = useCallback(() => {
    if (!hasSubmittedRef.current) doSubmit(true);
  }, [doSubmit]);

  const handleViolation = useCallback(
    (reason: SuspiciousEventType) => {
      setTerminatedReason(reason);
      if (section) attemptsApi.terminate(section.attempt_id, { reason });
    },
    [section]
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

  const { urgency, formatted } = useTestTimer({
    attemptId: sectionAttemptId,
    initialSeconds,
    onExpire: handleTimerExpire,
    enabled: isActive && initialSeconds > 0,
  });

  useSuspiciousEvents({
    attemptId: sectionAttemptId,
    enabled: isActive,
    onViolation: handleViolation,
    onBlocked: handleBlocked,
  });

  // ── Derived values ────────────────────────────────────────
  const answeredCount = Object.keys(answers).filter((k) => questions.some((q) => q.id === k)).length;
  const currentQuestion = questions[currentIndex];

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  const statusScreen = renderSectionStatus({
    loadState,
    loadError,
    terminatedReason,
    testTitle,
    examDone,
    examAttemptId,
    ready: Boolean(section && currentQuestion),
  });
  if (statusScreen) return statusScreen;

  // Narrowed by the `ready` check above (renderSectionStatus returns a
  // fallback screen otherwise), so section/currentQuestion are non-null here.
  const activeSection = section!;
  const activeQuestion = currentQuestion!;

  return (
    <div className="flex flex-col gap-0">
      <BlockedToast message={blockedToast} />

      {/* ── Sticky header ─────────────────────────────────── */}
      <SectionExamHeader
        section={activeSection}
        testTitle={testTitle}
        currentIndex={currentIndex}
        totalQuestions={questions.length}
        answeredCount={answeredCount}
        isOnline={isOnline}
        saveError={saveError}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
        formatted={formatted}
        urgency={urgency}
      />

      {/* ── Question card ──────────────────────────────────── */}
      <SectionQuestionCard
        question={activeQuestion}
        answer={answers[activeQuestion.id]}
        onChange={handleAnswerChange}
        disabled={isSubmitting}
        index={currentIndex}
      />

      {/* ── Navigation ─────────────────────────────────────── */}
      <SectionNavigationBar
        questions={questions}
        answers={answers}
        currentIndex={currentIndex}
        isSubmitting={isSubmitting}
        sectionIndex={activeSection.section_index}
        totalSections={activeSection.total_sections}
        onPrevious={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        onNext={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
        onJumpTo={(i) => setCurrentIndex(i)}
        onSubmitClick={() => setShowConfirm(true)}
      />

      <SubmitErrorBanner
        message={submitError}
        isSubmitting={isSubmitting}
        onRetry={() => doSubmit(lastAutoSubmittedRef.current)}
      />

      <TimeCriticalBanner show={urgency === "critical" && !isSubmitting} />

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

export default function SectionedExamPage() {
  return (
    <Suspense fallback={<SectionLoadingSpinner />}>
      <SectionedExamPageContent />
    </Suspense>
  );
}

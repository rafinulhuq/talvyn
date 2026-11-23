"use client";

import { ChevronLeft, ChevronRight, CloudOff, Send } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { formatClock, isAnswered, urgencyFor } from "@/lib/candidate/answers";
import { clearAttempt } from "@/lib/candidate/local-store";
import { useAutosave } from "@/lib/candidate/use-autosave";
import { useExamTimer } from "@/lib/candidate/use-exam-timer";
import { useIntegrity } from "@/lib/candidate/use-integrity";
import { cn } from "@/lib/cn";
import type { AnswerMap, CandidateQuestion, IntegrityEvent } from "@/types/attempt";
import { QuestionView } from "./question-view";

export type RunnerProps = {
  attemptId: string;
  title: string;
  /** e.g. "Section 2 of 3: Practical". */
  context?: string;
  questions: CandidateQuestion[];
  initialSeconds: number;
  initialAnswers: AnswerMap;
  /** Answers restored from this device that the server hasn't confirmed yet. */
  pending?: string[];
  submitLabel?: string;
  /** Returns an error message, or null when the server accepted the submission. */
  onSubmit: (answers: AnswerMap, auto: boolean) => Promise<string | null>;
  onViolation: (reason: IntegrityEvent) => void;
};

/**
 * One timed sitting. Mount it with key={attemptId}: the timer, autosave and
 * integrity hooks all start fresh per attempt. The parent swaps it out for a
 * finished or ended screen; while it's mounted the attempt is live.
 */
export function ExamRunner(p: RunnerProps) {
  const [answers, setAnswers] = useState<AnswerMap>(p.initialAnswers);
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const submitted = useRef(false);
  const lastAuto = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { online, savedAt, saving, failed, saveNow } = useAutosave({ attemptId: p.attemptId, answers, enabled: true, pending: p.pending });

  const submit = useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      lastAuto.current = auto;
      setSubmitting(true);
      setConfirm(false);
      setSubmitError(undefined);
      await saveNow();
      const err = await p.onSubmit(answers, auto);
      if (err) {
        // Nothing reached the server: never pretend it did. Answers are still saved.
        submitted.current = false;
        setSubmitting(false);
        setSubmitError(err);
        return;
      }
      void clearAttempt(p.attemptId);
    },
    [answers, p, saveNow],
  );

  const remaining = useExamTimer({ attemptId: p.attemptId, initialSeconds: p.initialSeconds, enabled: p.initialSeconds > 0, onExpire: () => void submit(true) });

  useIntegrity({
    attemptId: p.attemptId,
    enabled: true,
    onViolation: p.onViolation,
    onBlocked: (m) => {
      setNotice(m);
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(undefined), 2500);
    },
  });

  const answered = useMemo(() => p.questions.filter((q) => isAnswered(q, answers[q.id])).length, [answers, p.questions]);
  const q = p.questions[index];
  const urgency = urgencyFor(remaining);
  const last = index === p.questions.length - 1;
  const change = useCallback((id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v })), []);

  if (!q) return null;
  const unanswered = p.questions.length - answered;

  return (
    <div className="flex flex-col gap-5">
      {/* Status bar */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-medium text-ink">{p.title}</h1>
            <p className="truncate text-sm text-ink-muted">
              {p.context ? `${p.context}. ` : ""}
              {answered} of {p.questions.length} answered
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <SaveStatus online={online} saving={saving} failed={failed} savedAt={savedAt} />
            <div
              role="timer"
              aria-label={`Time left: ${formatClock(remaining)}`}
              className={cn(
                "rounded-control border px-3 py-1.5 font-mono text-lg tabular-nums",
                urgency === "critical" ? "border-danger/40 bg-danger-soft text-danger" : urgency === "warning" ? "border-warning/40 bg-warning-soft text-warning" : "border-line bg-surface text-ink",
              )}
            >
              {formatClock(remaining)}
            </div>
          </div>
        </div>
      </div>

      {urgency === "critical" && !submitting && (
        <Alert tone="danger">Less than a minute left. When time runs out, your saved answers are submitted automatically.</Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex flex-col gap-4">
          <QuestionView question={q} value={answers[q.id]} onChange={change} disabled={submitting} number={index + 1} total={p.questions.length} />
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={index === 0 || submitting} onClick={() => setIndex(index - 1)}>
              <ChevronLeft aria-hidden className="size-4" /> Previous
            </Button>
            {last ? (
              <Button variant="primary" disabled={submitting} onClick={() => setConfirm(true)}>
                Review and submit
              </Button>
            ) : (
              <Button variant="primary" disabled={submitting} onClick={() => setIndex(index + 1)}>
                Next <ChevronRight aria-hidden className="size-4" />
              </Button>
            )}
          </div>
          {submitError && (
            <Alert tone="danger" title="Your answers weren't submitted">
              {submitError}
              <div className="mt-3">
                <Button size="sm" variant="primary" loading={submitting} onClick={() => void submit(lastAuto.current)}>
                  <Send aria-hidden className="size-3.5" /> Try submitting again
                </Button>
              </div>
            </Alert>
          )}
        </div>

        <nav aria-label="Questions" className="rounded-panel border border-line bg-surface p-4 lg:sticky lg:top-24">
          <ol className="grid grid-cols-8 gap-1.5 lg:grid-cols-5">
            {p.questions.map((x, i) => {
              const done = isAnswered(x, answers[x.id]);
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    disabled={submitting}
                    aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                    aria-current={i === index ? "step" : undefined}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "grid h-8 w-full place-items-center rounded-control border text-sm tabular-nums",
                      i === index ? "border-accent bg-accent text-accent-ink" : done ? "border-accent/40 bg-accent-soft text-accent-soft-ink" : "border-line text-ink-muted hover:bg-sunken",
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
          <Button variant="secondary" className="mt-4 w-full" disabled={submitting} onClick={() => setConfirm(true)}>
            {p.submitLabel ?? "Submit"}
          </Button>
        </nav>
      </div>

      <Dialog open={confirm} onOpenChange={(o) => !submitting && setConfirm(o)}>
        <DialogContent
          title={p.submitLabel ?? "Submit your answers?"}
          description={
            unanswered === 0
              ? `You've answered all ${p.questions.length} questions. You can't change answers after submitting.`
              : `${unanswered} ${unanswered === 1 ? "question is" : "questions are"} unanswered and will score zero. You can't change answers after submitting.`
          }
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep working</Button>
              </DialogClose>
              <Button variant="primary" loading={submitting} onClick={() => void submit(false)}>
                Submit
              </Button>
            </>
          }
        />
      </Dialog>

      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {notice && <p className="rounded-control bg-ink px-4 py-2.5 text-base text-canvas shadow-float animate-fade-in">{notice}</p>}
      </div>
    </div>
  );
}

function SaveStatus({ online, saving, failed, savedAt }: { online: boolean; saving: boolean; failed: boolean; savedAt: Date | null }) {
  const text = !online ? "Offline. Answers are kept on this device." : saving ? "Saving" : failed ? "Not saved yet. Retrying." : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
  return (
    <span aria-live="polite" className={cn("hidden items-center gap-1.5 text-sm sm:inline-flex", !online || failed ? "text-warning" : "text-ink-muted")}>
      {!online && <CloudOff aria-hidden className="size-3.5" />}
      {text}
    </span>
  );
}

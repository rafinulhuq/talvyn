"use client";

import { CircleAlert, CircleCheck, Clock, Loader2, ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { attempts, exams } from "@/lib/candidate/client";
import { usePoll } from "@/lib/use-poll";
import type { ExamStatus, SubmitResult } from "@/types/attempt";
import { CandidateMessage } from "./shell";

const REASON: Record<string, string> = {
  TAB_SWITCH: "another tab was opened",
  WINDOW_BLUR: "the assessment window lost focus",
  VISIBILITY_HIDDEN: "the assessment page was hidden",
  FULLSCREEN_EXIT: "full screen was closed",
};

export function Loading({ label = "Opening your assessment" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-24 text-base text-ink-muted">
      <Loader2 aria-hidden className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function LoadFailed({ message }: { message: string }) {
  return (
    <CandidateMessage icon={<CircleAlert aria-hidden className="size-5" />} title="Your assessment didn't open">
      <p className="max-w-md text-md text-ink-muted">{message}</p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Reload the page
      </Button>
    </CandidateMessage>
  );
}

export function Ended({ title, reason }: { title?: string; reason?: string | null }) {
  const why = reason ? REASON[reason] : undefined;
  return (
    <CandidateMessage icon={<ShieldX aria-hidden className="size-5" />} tone="danger" title="This assessment has ended">
      {title && <p className="-mt-3 text-base text-ink-muted">{title}</p>}
      <p className="max-w-md text-md text-ink-muted">
        It ended because {why ?? "the assessment window was left"}. For fairness, the remaining tests in this invitation are closed.
      </p>
      <p className="max-w-md text-base text-ink-muted">If you think this was a mistake, contact the person who invited you.</p>
    </CandidateMessage>
  );
}

/** After one test of an invitation. Offers the next test when there is one. */
export function TestDone({ result, title }: { result: SubmitResult; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const next = result.next_test_index;
  const hasNext = next !== null && next !== undefined;

  async function startNext() {
    if (!hasNext) return;
    setBusy(true);
    const res = await attempts.start(next);
    if (res.ok) return router.push(`/tests/session/exam?attempt=${encodeURIComponent(res.data.attempt_id)}`);
    setBusy(false);
    setError("The next test didn't start. Open the link from your invitation email to continue.");
  }

  return (
    <CandidateMessage icon={<CircleCheck aria-hidden className="size-5" />} tone="success" title={hasNext ? "Test submitted" : "Assessment submitted"}>
      <p className="-mt-3 text-base text-ink-muted">{title}</p>
      <dl className="grid w-full max-w-sm grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line text-left">
        <div className="bg-surface px-4 py-3">
          <dt className="text-sm text-ink-muted">Answered</dt>
          <dd className="text-lg text-ink">
            {result.answered_questions} of {result.total_questions}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-sm text-ink-muted">Submitted</dt>
          <dd className="text-lg text-ink">{result.auto_submitted ? "When time ran out" : "By you"}</dd>
        </div>
      </dl>
      {hasNext ? (
        <>
          <p className="max-w-md text-md text-ink-muted">
            Test {next + 1} of {result.total_tests} is next. Start it now, or come back later with the same email link.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button variant="primary" className="h-10 px-5" loading={busy} onClick={() => void startNext()}>
            Start test {next + 1} of {result.total_tests}
          </Button>
        </>
      ) : (
        <p className="max-w-md text-md text-ink-muted">The hiring team will review your answers and be in touch about next steps. You can close this window.</p>
      )}
    </CandidateMessage>
  );
}

/** After the last section. Shows progress of scoring; never shows scores to the candidate. */
export function ExamDone({ examId }: { examId: string }) {
  const [status, setStatus] = useState<string>("SUBMITTED");
  const settled = status === "EVALUATED" || status === "FAILED";
  usePoll(
    async () => {
      const res = await exams.status(examId);
      if (res.ok) setStatus((res.data as ExamStatus).status);
    },
    5000,
    !settled,
  );
  const scoring = status === "EVALUATING";
  return (
    <CandidateMessage
      icon={scoring ? <Loader2 aria-hidden className="size-5 animate-spin" /> : status === "FAILED" ? <Clock aria-hidden className="size-5" /> : <CircleCheck aria-hidden className="size-5" />}
      tone={status === "EVALUATED" ? "success" : "neutral"}
      title={status === "EVALUATED" ? "All done" : "Assessment submitted"}
    >
      <p aria-live="polite" className="max-w-md text-md text-ink-muted">
        {status === "EVALUATED"
          ? "Your answers have been reviewed. The hiring team will be in touch about next steps."
          : status === "FAILED"
            ? "Your answers are saved. Reviewing them is taking longer than usual; there's nothing more for you to do."
            : scoring
              ? "All three sections are in, and your answers are being reviewed now. You can close this window."
              : "All three sections are in. You can close this window."}
      </p>
    </CandidateMessage>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { mergeResume, sortForCandidate, toPayloads } from "@/lib/candidate/answers";
import { attempts, exams } from "@/lib/candidate/client";
import { dirtyAnswers } from "@/lib/candidate/local-store";
import { SECTION_LABEL, type AnswerMap, type CandidateQuestion, type ExamSection, type IntegrityEvent, type SubmitResult } from "@/types/attempt";
import { ExamRunner } from "./exam-runner";
import { Ended, ExamDone, LoadFailed, Loading, TestDone } from "./outcomes";

const LINK_GONE = "This link isn't active any more. It may have been replaced by a newer invitation; check your email for the latest link, or contact the person who invited you.";
const NOT_FOUND = "We couldn't find your assessment. Open the link from your invitation email again.";
const TROUBLE = "The assessment couldn't be loaded right now. This isn't something you did. Reload the page in a moment.";
const SUBMIT_FAILED = "Your answers are saved on this device and on our side up to the last save. Check your connection, then try again.";

type Live = { attemptId: string; title: string; questions: CandidateQuestion[]; seconds: number; answers: AnswerMap; pending: string[] };

async function prepare(attemptId: string, questions: CandidateQuestion[], server: AnswerMap): Promise<Pick<Live, "questions" | "answers" | "pending">> {
  const sorted = sortForCandidate(questions);
  const { answers, pending } = mergeResume(server, await dirtyAnswers(attemptId), new Set(sorted.map((q) => q.id)));
  return { questions: sorted, answers, pending };
}

type TestView = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ended"; title: string; reason: string | null } | { kind: "done"; title: string; result: SubmitResult } | ({ kind: "live" } & Live);

/** One test of a single-test invitation: /tests/session/exam?attempt=… */
export function TestFlow({ attemptId }: { attemptId: string }) {
  const [view, setView] = useState<TestView>({ kind: "loading" });

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    void (async () => {
      const res = await attempts.state(attemptId);
      if (cancelled) return;
      if (!res.ok) return setView({ kind: "error", message: [400, 401, 403].includes(res.status) ? LINK_GONE : res.status === 404 ? NOT_FOUND : TROUBLE });
      const s = res.data;
      if (s.status === "TERMINATED") return setView({ kind: "ended", title: s.test_title, reason: s.integrity_violation_reason });
      if (s.status === "SUBMITTED" || s.status === "EVALUATED") {
        return setView({
          kind: "done",
          title: s.test_title,
          result: { attempt_id: attemptId, submitted_at: "", total_questions: s.questions.length, answered_questions: Object.keys(s.saved_answers).length, auto_submitted: false, message: "", next_test_index: null, total_tests: 0 },
        });
      }
      const ready = await prepare(attemptId, s.questions, s.saved_answers);
      if (!cancelled) setView({ kind: "live", attemptId, title: s.test_title, seconds: s.server_time_remaining_seconds, ...ready });
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const title = view.kind === "live" ? view.title : "";
  const onSubmit = useCallback(
    async (answers: AnswerMap, auto: boolean) => {
      const res = await attempts.submit(attemptId, toPayloads(answers), auto);
      if (!res.ok) return SUBMIT_FAILED;
      setView({ kind: "done", title, result: res.data });
      return null;
    },
    [attemptId, title],
  );
  const onViolation = useCallback(
    (reason: IntegrityEvent) => {
      // Lock the screen first; the request retries once in the background.
      setView({ kind: "ended", title, reason });
      void attempts.terminate(attemptId, reason);
    },
    [attemptId, title],
  );

  if (!attemptId) return <LoadFailed message={NOT_FOUND} />;
  if (view.kind === "loading") return <Loading />;
  if (view.kind === "error") return <LoadFailed message={view.message} />;
  if (view.kind === "ended") return <Ended title={view.title} reason={view.reason} />;
  if (view.kind === "done") return <TestDone title={view.title} result={view.result} />;
  return (
    <ExamRunner
      key={view.attemptId}
      attemptId={view.attemptId}
      title={view.title}
      questions={view.questions}
      initialSeconds={view.seconds}
      initialAnswers={view.answers}
      pending={view.pending}
      submitLabel="Submit test"
      onSubmit={onSubmit}
      onViolation={onViolation}
    />
  );
}

type ExamView = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ended"; title: string; reason: string | null } | { kind: "done" } | ({ kind: "live"; section: ExamSection } & Live);

/** The sectioned exam: /exam/session/section?attempt=<exam attempt id>. Sections load in place. */
export function ExamFlow({ examId }: { examId: string }) {
  const [view, setView] = useState<ExamView>({ kind: "loading" });
  const [round, setRound] = useState(0); // bump to load the next section

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    void (async () => {
      const res = await exams.current(examId);
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 409) return setView({ kind: "done" }); // every section already submitted
        return setView({ kind: "error", message: [400, 401, 403].includes(res.status) ? LINK_GONE : res.status === 404 ? NOT_FOUND : TROUBLE });
      }
      const s = res.data;
      const ready = await prepare(s.attempt_id, s.questions, s.saved_answers);
      // The backend reports the section's full duration here, as the previous frontend used;
      // the first heartbeat corrects it if the section was already running.
      if (!cancelled) setView({ kind: "live", section: s, attemptId: s.attempt_id, title: s.test_title, seconds: s.duration_seconds, ...ready });
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, round]);

  const section = view.kind === "live" ? view.section : null;
  const onSubmit = useCallback(
    async (answers: AnswerMap, auto: boolean) => {
      if (!section) return SUBMIT_FAILED;
      const res = await exams.submitSection(examId, section.section_type, toPayloads(answers), auto);
      if (!res.ok) return SUBMIT_FAILED;
      if (res.data.next_section_type) {
        setView({ kind: "loading" });
        setRound((r) => r + 1);
      } else {
        await exams.submit(examId); // confirmation; the status screen reflects the real state either way
        setView({ kind: "done" });
      }
      return null;
    },
    [examId, section],
  );
  const onViolation = useCallback(
    (reason: IntegrityEvent) => {
      if (!section) return;
      setView({ kind: "ended", title: section.test_title, reason });
      void attempts.terminate(section.attempt_id, reason);
    },
    [section],
  );

  if (!examId) return <LoadFailed message={NOT_FOUND} />;
  if (view.kind === "loading") return <Loading label={round > 0 ? "Opening the next section" : undefined} />;
  if (view.kind === "error") return <LoadFailed message={view.message} />;
  if (view.kind === "ended") return <Ended title={view.title} reason={view.reason} />;
  if (view.kind === "done") return <ExamDone examId={examId} />;
  const s = view.section;
  return (
    <ExamRunner
      key={view.attemptId}
      attemptId={view.attemptId}
      title={view.title}
      context={`Section ${s.section_index} of ${s.total_sections}: ${SECTION_LABEL[s.section_type] ?? s.section_type}`}
      questions={view.questions}
      initialSeconds={view.seconds}
      initialAnswers={view.answers}
      pending={view.pending}
      submitLabel={s.section_index < s.total_sections ? "Submit section" : "Submit assessment"}
      onSubmit={onSubmit}
      onViolation={onViolation}
    />
  );
}

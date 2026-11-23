import type { AnswerMap, AnswerPayload, CandidateQuestion, OptionLabel } from "@/types/attempt";

/** The backend trims every answer to 10,000 characters; the inputs stop there so nothing is cut silently. */
export const MAX_ANSWER_CHARS = 10_000;

const OPTIONS = new Set(["A", "B", "C", "D"]);

/** One stored answer → the backend's shape. "A".."D" is a choice; anything else is text (empty → null). */
export function toPayload(questionId: string, value: string): AnswerPayload {
  if (OPTIONS.has(value)) return { question_id: questionId, selected_option: value as OptionLabel, answer_text: null };
  return { question_id: questionId, selected_option: null, answer_text: value || null };
}

export const toPayloads = (answers: AnswerMap): AnswerPayload[] => Object.entries(answers).map(([id, v]) => toPayload(id, v));

/** A question counts as answered when it has a non-blank value. Starter code alone isn't an answer. */
export function isAnswered(q: CandidateQuestion, value: string | undefined): boolean {
  if (!value || !value.trim()) return false;
  if (q.question_type === "CODE" && q.code_starter && value.trim() === q.code_starter.trim()) return false;
  return true;
}

/** Candidates see multiple choice, then written, then code; stable within a type. */
const ORDER = { MCQ: 0, OPEN_ENDED: 1, CODE: 2 } as const;
export const sortForCandidate = (qs: readonly CandidateQuestion[]) =>
  [...qs].sort((a, b) => ORDER[a.question_type] - ORDER[b.question_type] || a.order_index - b.order_index || a.id.localeCompare(b.id));

/**
 * Resume: answers typed but never confirmed by the server (dirty in IndexedDB)
 * win over the server copy; everything else comes from the server.
 * Returns the merged map and which ids still need saving.
 */
export function mergeResume(server: AnswerMap, localDirty: AnswerMap, questionIds: Set<string>): { answers: AnswerMap; pending: string[] } {
  const answers = { ...server };
  const pending: string[] = [];
  for (const [id, v] of Object.entries(localDirty)) {
    if (!questionIds.has(id) || server[id] === v) continue;
    answers[id] = v;
    pending.push(id);
  }
  return { answers, pending };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type Urgency = "normal" | "warning" | "critical";
/** Same thresholds as before: under 5 minutes is a warning, under 1 minute is critical. */
export const urgencyFor = (seconds: number): Urgency => (seconds <= 60 ? "critical" : seconds <= 300 ? "warning" : "normal");

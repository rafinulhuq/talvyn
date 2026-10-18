/**
 * TypeScript types for the test attempt module.
 * Mirrors app/schemas/attempt.py
 */

// ─── Question (safe — no correct answers) ────────────────────

export interface MCQOptionSafe {
  label: "A" | "B" | "C" | "D";
  text: string;
  // is_correct intentionally absent — never sent to candidate
}

export interface QuestionForCandidate {
  id: string;
  question_type: "MCQ" | "OPEN_ENDED" | "CODE";
  question_text: string;
  skill_tested: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: number;
  order_index: number;
  options: MCQOptionSafe[] | null; // null for OPEN_ENDED/CODE
  code_language: string | null;    // CODE only
  code_starter: string | null;     // CODE only — optional starter code
}

// ─── Start attempt ────────────────────────────────────────────

export interface StartAttemptRequest {
  /** Injected server-side by the candidate proxy from the httpOnly
   * attempt-token cookie (A8-4) — client code never supplies it. */
  token?: string;
  test_index?: number;
}

export interface StartAttemptResponse {
  attempt_id: string;
  test_id: string;
  test_title: string;
  duration_seconds: number;
  total_questions: number;
  questions: QuestionForCandidate[];
  started_at: string;
  saved_answers: Record<string, string>; // question_id → selected_option or answer_text
}

// ─── Save answer ──────────────────────────────────────────────

export interface SaveAnswerRequest {
  question_id: string;
  selected_option?: "A" | "B" | "C" | "D" | null;
  answer_text?: string | null;
}

export interface SaveAnswerResponse {
  question_id: string;
  saved: boolean;
  saved_at: string;
}

// ─── Bulk save ────────────────────────────────────────────────

export interface BulkSaveRequest {
  answers: SaveAnswerRequest[];
}

export interface BulkSaveResponse {
  saved_count: number;
}

// ─── Heartbeat ────────────────────────────────────────────────

export interface HeartbeatRequest {
  client_time_remaining_seconds: number;
}

export interface HeartbeatResponse {
  attempt_id: string;
  server_time_remaining_seconds: number;
  force_submit: boolean;
  status: string;
}

// ─── Submit ───────────────────────────────────────────────────

export interface SubmitAttemptRequest {
  answers: SaveAnswerRequest[];
  auto_submitted: boolean;
}

export interface SubmitAttemptResponse {
  attempt_id: string;
  submitted_at: string;
  total_questions: number;
  answered_questions: number;
  auto_submitted: boolean;
  message: string;
  next_test_index: number | null;
  total_tests: number;
}

// ─── Suspicious events ────────────────────────────────────────

export type SuspiciousEventType =
  | "TAB_SWITCH"
  | "WINDOW_BLUR"
  | "VISIBILITY_HIDDEN"
  | "COPY_ATTEMPT"
  | "PASTE_ATTEMPT"
  | "CUT_ATTEMPT"
  | "CONTEXT_MENU"
  | "DEVTOOLS_OPEN"
  | "FULLSCREEN_EXIT"
  | "BLOCKED_SHORTCUT";

export interface SuspiciousEventRequest {
  event_type: SuspiciousEventType;
  metadata?: Record<string, unknown> | null;
}

// ─── Terminate (hard integrity enforcement) ───────────────────

export interface TerminateAttemptRequest {
  reason: SuspiciousEventType;
  metadata?: Record<string, unknown> | null;
}

export interface TerminateAttemptResponse {
  attempt_id: string;
  status: string;
  terminated_at: string;
  message: string;
}

// ─── Attempt state (resume) ───────────────────────────────────

export interface AttemptStateResponse {
  attempt_id: string;
  test_id: string;
  test_title: string;
  status: string;
  duration_seconds: number;
  server_time_remaining_seconds: number;
  started_at: string;
  questions: QuestionForCandidate[];
  saved_answers: Record<string, string>;
  integrity_violation_reason: string | null;
  terminated_at: string | null;
}

export interface LocalAnswerMap {
  [questionId: string]: string; // selected_option ("A"/"B"/"C"/"D") or answer_text
}

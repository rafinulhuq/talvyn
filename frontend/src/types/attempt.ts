// Mirrors backend/app/schemas/attempt.py and schemas/exam.py (candidate side).
// Candidate payloads never include correct answers.
export type OptionLabel = "A" | "B" | "C" | "D";

export type CandidateQuestion = {
  id: string;
  question_type: "MCQ" | "OPEN_ENDED" | "CODE";
  question_text: string;
  skill_tested: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  marks: number;
  order_index: number;
  options: { label: OptionLabel; text: string }[] | null;
  code_language: string | null;
  code_starter: string | null;
};

/** question_id → "A".."D" for multiple choice, or the typed text. */
export type AnswerMap = Record<string, string>;

export type AnswerPayload = { question_id: string; selected_option: OptionLabel | null; answer_text: string | null };

export type StartAttemptResult = {
  attempt_id: string;
  test_id: string;
  test_title: string;
  duration_seconds: number;
  total_questions: number;
  questions: CandidateQuestion[];
  started_at: string;
  saved_answers: AnswerMap;
};

export type AttemptState = {
  attempt_id: string;
  test_id: string;
  test_title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "EVALUATED" | "TERMINATED" | string;
  duration_seconds: number;
  server_time_remaining_seconds: number;
  started_at: string;
  questions: CandidateQuestion[];
  saved_answers: AnswerMap;
  integrity_violation_reason: string | null;
  terminated_at: string | null;
};

export type HeartbeatResult = { attempt_id: string; server_time_remaining_seconds: number; force_submit: boolean; status: string };

export type SubmitResult = {
  attempt_id: string;
  submitted_at: string;
  total_questions: number;
  answered_questions: number;
  auto_submitted: boolean;
  message: string;
  next_test_index: number | null;
  total_tests: number;
};

export type IntegrityEvent =
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

export type SectionType = "REASONING" | "PRACTICAL" | "TECHNICAL";
export const SECTION_ORDER: SectionType[] = ["REASONING", "PRACTICAL", "TECHNICAL"];
export const SECTION_LABEL: Record<SectionType, string> = { REASONING: "Reasoning", PRACTICAL: "Practical", TECHNICAL: "Technical" };

export type ExamSection = {
  exam_attempt_id: string;
  /** The section's underlying test attempt: save, heartbeat, event and terminate use this id. */
  attempt_id: string;
  section_type: SectionType;
  section_index: number; // 1-based
  total_sections: number;
  test_title: string;
  duration_seconds: number;
  total_questions: number;
  questions: CandidateQuestion[];
  started_at: string;
  saved_answers: AnswerMap;
  exam_status: string;
};

export type SectionSubmitResult = { exam_attempt_id: string; section_type: SectionType; section_submitted: boolean; next_section_type: SectionType | null; exam_status: string; message: string };
export type ExamStatus = {
  exam_attempt_id: string;
  status: string;
  current_section_type: SectionType | null;
  sections_completed: number;
  total_sections: number;
};

export type TokenValidation = {
  valid: boolean;
  candidate_name: string | null;
  jd_title: string | null;
  test_titles: string[];
  invitation_status: string | null;
  expires_at: string | null;
  next_test_index: number | null;
  total_tests: number;
  reason: "expired" | "already_used" | "not_found" | "revoked" | "terminated" | string | null;
};

export type PublicLinkResolve = {
  valid: boolean;
  jd_title: string | null;
  link_title: string | null;
  tests: { title: string; duration_minutes: number }[];
  reason: "not_found" | "disabled" | "expired" | "no_tests" | "max_reached" | string | null;
};

export type PublicRegisterResult = { status: "redirect" | "already_completed" | "terminated" | string; token: string | null; redirect_url: string | null; message: string };

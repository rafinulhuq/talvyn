// Mirrors backend/app/schemas/test.py and schemas/exam.py (question bank).
export type TestType = "TECHNICAL" | "REASONING" | "PROBLEM_SOLVING" | "PRACTICAL";
export type TestStatus = "DRAFT" | "APPROVED" | "ARCHIVED";
export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "MIXED";
export type QuestionType = "MCQ" | "OPEN_ENDED" | "CODE";
export type OptionLabel = "A" | "B" | "C" | "D";

export type TestSummary = {
  id: string;
  jd_id: string;
  test_type: TestType;
  title: string;
  duration_minutes: number;
  total_marks: number;
  difficulty: Difficulty;
  status: TestStatus;
  passing_marks: number | null;
  question_count: number;
  mcq_count: number;
  open_ended_count: number;
  code_count: number;
  created_at: string;
  updated_at: string;
};

export type McqOption = { label: string; text: string; is_correct: boolean };

export type Question = {
  id: string;
  test_id: string;
  question_type: QuestionType;
  question_text: string;
  skill_tested: string | null;
  difficulty: Difficulty;
  marks: number;
  order_index: number;
  options: McqOption[] | null;
  correct_answer: string | null;
  explanation: string | null;
  expected_answer: string | null;
  scoring_rubric: string | null;
  code_language: string | null;
  code_starter: string | null;
  created_at: string;
  updated_at: string;
};

export type Test = Omit<TestSummary, "question_count" | "mcq_count" | "open_ended_count" | "code_count"> & {
  description: string | null;
  questions: Question[];
};

export type DifficultyMix = { easy_percent: number; medium_percent: number; hard_percent: number };

/** One SSE event from .../progress/stream. pct reaches 100 on the final event. */
export type GenerationProgress = { step: string; pct: number; detail: string };

export type BankSection = { mcq: number; cq: number; meets_minimum: boolean; meets_commercial_recommended: boolean };
export type BankStatus = {
  exists: boolean;
  bank_id?: string | null;
  status: "DRAFT" | "GENERATING" | "READY" | "FAILED" | "ARCHIVED" | null;
  ready: boolean;
  below_recommended: boolean;
  is_approved?: boolean;
  sections: Partial<Record<"REASONING" | "PRACTICAL" | "TECHNICAL", BankSection>>;
};

export type ExamTemplate = {
  id: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  config_json: { mcq_target?: number | null; cq_target?: number | null; section_weights?: Record<string, number> | null };
};

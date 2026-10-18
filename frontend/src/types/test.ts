/**
 * TypeScript types for Tests and Questions.
 * Mirrors the FastAPI Pydantic schemas in backend/app/schemas/test.py
 */

import type { Difficulty } from "./index";

// ─── Enums ────────────────────────────────────────────────────

export type TestType = "TECHNICAL" | "REASONING" | "PROBLEM_SOLVING";
export type TestStatus = "DRAFT" | "APPROVED" | "ARCHIVED";
export type QuestionType = "MCQ" | "OPEN_ENDED" | "CODE";

// ─── Core types ───────────────────────────────────────────────

export interface MCQOption {
  label: "A" | "B" | "C" | "D";
  text: string;
  is_correct: boolean;
}

export interface Question {
  id: string;
  test_id: string;
  question_type: QuestionType;
  question_text: string;
  skill_tested: string | null;
  difficulty: Difficulty;
  marks: int;
  order_index: number;
  // MCQ
  options: MCQOption[] | null;
  correct_answer: string | null;
  explanation: string | null;
  // Open-ended
  expected_answer: string | null;
  scoring_rubric: string | null;
  // Coding
  code_language: string | null;
  code_starter: string | null;
  created_at: string;
  updated_at: string;
}

export interface Test {
  id: string;
  jd_id: string;
  test_type: TestType;
  title: string;
  description: string | null;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number | null;
  difficulty: Difficulty;
  status: TestStatus;
  questions: Question[];
  created_at: string;
  updated_at: string;
}

export interface TestSummary {
  id: string;
  jd_id: string;
  test_type: TestType;
  title: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number | null;
  difficulty: Difficulty;
  status: TestStatus;
  question_count: number;
  mcq_count: number;
  open_ended_count: number;
  code_count: number;
  created_at: string;
  updated_at: string;
}

// ─── API response types ───────────────────────────────────────

export interface GenerateTestsResponse {
  jd_id: string;
  tests: TestSummary[];
  message: string;
  is_regeneration: boolean;
}

// ─── Request types ────────────────────────────────────────────

export interface UpdateTestRequest {
  title?: string;
  description?: string;
  duration_minutes?: number;
  difficulty?: Difficulty;
  /** Score needed to Pass. Rejected server-side if it exceeds total_marks. */
  passing_marks?: number;
}

export interface MCQOptionUpdate {
  label: "A" | "B" | "C" | "D";
  text: string;
  is_correct: boolean;
}

export interface UpdateQuestionRequest {
  question_text?: string;
  skill_tested?: string | null;
  difficulty?: Difficulty;
  marks?: number;
  options?: MCQOptionUpdate[];
  correct_answer?: string;
  explanation?: string;
  expected_answer?: string;
  scoring_rubric?: string;
  code_language?: string | null;
  code_starter?: string | null;
}

// TypeScript doesn't have int, alias for clarity
type int = number;

// ─── UI helpers ───────────────────────────────────────────────

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  TECHNICAL: "Technical Screening",
  REASONING: "Practical Reasoning",
  PROBLEM_SOLVING: "Role-Specific Problem-Solving",
};

export const TEST_TYPE_COLORS: Record<TestType, string> = {
  TECHNICAL: "blue",
  REASONING: "purple",
  PROBLEM_SOLVING: "green",
};

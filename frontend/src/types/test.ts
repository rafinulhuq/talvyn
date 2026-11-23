// Mirrors backend/app/schemas/test.py (TestSummaryResponse)
export type TestType = "TECHNICAL" | "REASONING" | "PROBLEM_SOLVING" | string;
export type TestStatus = "DRAFT" | "APPROVED" | "ARCHIVED";
export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "MIXED";

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

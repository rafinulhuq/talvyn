// Mirrors backend/app/schemas/evaluation.py and exam.py (admin reports).
import type { Recommendation } from "./invitation";

export type QuestionFeedback = {
  id: string;
  question_id: string;
  question_type: "MCQ" | "OPEN_ENDED" | "CODE" | string;
  awarded_score: number;
  max_score: number;
  is_correct: boolean | null;
  ai_feedback: string | null;
  matched_criteria: string[];
  missed_criteria: string[];
  admin_awarded_score: number | null;
  estimated_ai_percentage: number | null;
  ai_detection_confidence: string | null;
  suspicious_phrases: string[] | null;
  ai_detection_explanation: string | null;
  ai_detection_recommendation: string | null;
  question_text: string | null;
  question_options: { label: string; text: string; is_correct?: boolean }[] | null;
  correct_answer: string | null;
  candidate_answer: string | null;
};

export type Evaluation = {
  id: string;
  attempt_id: string;
  total_score: number;
  max_score: number;
  percentage: number;
  mcq_score: number;
  mcq_max: number;
  open_ended_score: number;
  open_ended_max: number;
  ai_strengths: string[];
  ai_weaknesses: string[];
  ai_recommendation: Recommendation;
  ai_summary: string;
  evaluation_level: string | null;
  improvement_suggestions: string[];
  suitable_role: string | null;
  skill_breakdown: Record<string, unknown>;
  admin_override_recommendation: Recommendation | null;
  admin_notes: string | null;
  overall_ai_likeness_percentage: number | null;
  overall_ai_detection_confidence: string | null;
  flagged_answer_count: number;
  is_preliminary: boolean;
  evaluated_at: string;
  question_feedback: QuestionFeedback[];
};

export type InboxItem = {
  attempt_id: string;
  attempt_status: "SUBMITTED" | "EVALUATED" | "TERMINATED" | string;
  submitted_at: string | null;
  terminated_at: string | null;
  integrity_violation_reason: string | null;
  candidate_id: string;
  candidate_number: number;
  candidate_name: string;
  candidate_email: string;
  jd_id: string;
  jd_title: string;
  test_id: string;
  test_title: string;
  evaluation_id: string | null;
  percentage: number | null;
  recommendation: Recommendation | null;
  evaluation_level: string | null;
};

export type LeaderboardEntry = {
  rank: number;
  attempt_id: string;
  candidate_name: string;
  candidate_email: string;
  percentage: number;
  total_score: number;
  max_score: number;
  evaluation_level: string | null;
  ai_recommendation: Recommendation;
  admin_override_recommendation: Recommendation | null;
  evaluated_at: string;
  passing_marks: number | null;
  passed: boolean | null;
};

export type Leaderboard = { jd_id: string; job_title: string; total_candidates: number; avg_percentage: number; pass_rate: number | null; entries: LeaderboardEntry[] };

export type SystemReport = {
  jd_id: string;
  job_title: string;
  total_evaluated: number;
  avg_percentage: number;
  highest_percentage: number;
  lowest_percentage: number;
  pass_rate: number | null;
  recommendation_counts: Record<string, number>;
  level_counts: Record<string, number>;
  common_weak_skills: string[];
  common_strong_skills: string[];
};

export type GlobalEntry = LeaderboardEntry & {
  candidate_id: string | null;
  candidate_number: number | null;
  invited_by_name: string | null;
  company_name: string | null;
  ai_likeness_percentage: number | null;
  flagged_answer_count: number;
  jd_id: string;
  jd_title: string;
  test_id: string;
  test_type: string;
  test_title: string;
  mcq_score: number;
  mcq_max: number;
  open_ended_score: number;
  open_ended_max: number;
  ai_summary: string | null;
};

export type ExamSectionScore = { mcq_score: number; mcq_max: number; mcq_pct: number; cq_score: number; cq_max: number; cq_pct: number; section_score: number; weight: number };
export type ExamReport = {
  exam_attempt_id: string;
  candidate_id: string;
  jd_id: string;
  status: string;
  total_score: number | null;
  mcq_score: number | null;
  cq_score: number | null;
  section_scores: Partial<Record<"REASONING" | "PRACTICAL" | "TECHNICAL", ExamSectionScore>>;
  ai_risk_score: number | null;
  ai_likeness_risk: "low" | "medium" | "high" | null;
  ai_risk_reasons: string[];
  ai_risk_signals: { signal_type: string; risk_points: number; value: unknown }[];
  ai_risk_explanation: string | null;
  ai_risk_disclaimer: string;
};

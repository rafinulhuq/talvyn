/**
 * TypeScript types for the evaluation module.
 * Mirrors app/schemas/evaluation.py
 */

// ─── Core enums ───────────────────────────────────────────────

export type AIRecommendation = "STRONG_HIRE" | "HIRE" | "MAYBE" | "NO_HIRE";

// ─── AI-likeness estimate (opt-in, probabilistic — never a verdict) ───

export type AIDetectionConfidence = "LOW" | "MEDIUM" | "HIGH";
export type AIDetectionRecommendation = "NO_CONCERN" | "REVIEW_SUGGESTED" | "HIGH_CONCERN";

export const AI_DETECTION_CONFIDENCE_CONFIG: Record<
  AIDetectionConfidence,
  { label: string; color: string; bgColor: string }
> = {
  LOW:    { label: "Low confidence",    color: "text-slate-500",  bgColor: "bg-slate-100" },
  MEDIUM: { label: "Medium confidence", color: "text-amber-700",  bgColor: "bg-amber-50" },
  HIGH:   { label: "High confidence",   color: "text-brand-700",  bgColor: "bg-brand-50" },
};

export const AI_DETECTION_RECOMMENDATION_CONFIG: Record<
  AIDetectionRecommendation,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  NO_CONCERN:       { label: "No concern",       color: "text-success-dark", bgColor: "bg-success-light", borderColor: "border-success/20" },
  REVIEW_SUGGESTED: { label: "Review suggested", color: "text-warning-dark", bgColor: "bg-warning-light", borderColor: "border-warning/20" },
  HIGH_CONCERN:     { label: "High concern",     color: "text-danger-dark",  bgColor: "bg-danger-light",  borderColor: "border-danger/20" },
};

// ─── Per-question feedback ────────────────────────────────────

export interface QuestionFeedback {
  id: string;
  question_id: string;
  question_type: "MCQ" | "OPEN_ENDED" | "CODE";
  awarded_score: number;
  max_score: number;
  is_correct: boolean | null;       // MCQ only
  ai_feedback: string | null;       // Open-ended only
  matched_criteria: string[];
  missed_criteria: string[];
  admin_awarded_score: number | null;

  // AI-likeness estimate — open-ended only, null if disabled/not analyzed.
  // Probabilistic signal, never a verdict.
  estimated_ai_percentage: number | null;
  ai_detection_confidence: AIDetectionConfidence | null;
  suspicious_phrases: string[] | null;
  ai_detection_explanation: string | null;
  ai_detection_recommendation: AIDetectionRecommendation | null;

  // Enriched fields
  question_text: string | null;
  question_options: Array<{ label: string; text: string; is_correct: boolean }> | null;
  correct_answer: string | null;    // MCQ: "A"|"B"|"C"|"D"
  candidate_answer: string | null;  // MCQ: selected letter; OE: written text
}

// ─── Full evaluation ──────────────────────────────────────────

export type EvaluationLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";

export const EVALUATION_LEVEL_CONFIG: Record<EvaluationLevel, {
  label: string; color: string; bgColor: string; borderColor: string; emoji: string; description: string;
}> = {
  EXPERT:       { label: "Expert",        color: "text-emerald-700",  bgColor: "bg-emerald-50",   borderColor: "border-emerald-200", emoji: "🏆", description: "≥ 85% — Exceptional mastery" },
  ADVANCED:     { label: "Advanced",      color: "text-blue-700",     bgColor: "bg-blue-50",      borderColor: "border-blue-200",    emoji: "⭐", description: "70–84% — Strong proficiency" },
  INTERMEDIATE: { label: "Intermediate",  color: "text-warning-dark", bgColor: "bg-warning-light", borderColor: "border-warning/20",  emoji: "📈", description: "50–69% — Solid foundation" },
  BEGINNER:     { label: "Beginner",      color: "text-slate-600",    bgColor: "bg-slate-50",     borderColor: "border-slate-200",   emoji: "🌱", description: "< 50% — Needs development" },
};

export interface Evaluation {
  id: string;
  attempt_id: string;

  // Scores
  total_score: number;
  max_score: number;
  percentage: number;
  mcq_score: number;
  mcq_max: number;
  open_ended_score: number;
  open_ended_max: number;

  // AI narrative
  ai_strengths: string[];
  ai_weaknesses: string[];
  ai_recommendation: AIRecommendation;
  ai_summary: string;

  // Enhanced evaluation
  evaluation_level: EvaluationLevel | null;
  improvement_suggestions: string[];
  suitable_role: string | null;
  skill_breakdown: Record<string, number>;

  // Admin override
  admin_override_recommendation: AIRecommendation | null;
  admin_notes: string | null;

  // AI-likeness estimate — aggregated across open-ended answers, null if
  // disabled or there were no open-ended answers to analyze.
  overall_ai_likeness_percentage: number | null;
  overall_ai_detection_confidence: AIDetectionConfidence | null;
  flagged_answer_count: number;

  // Flags
  is_preliminary: boolean;
  evaluated_at: string;

  // Per-question
  question_feedback: QuestionFeedback[];
}

// ─── Leaderboard ──────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  attempt_id: string;
  candidate_name: string;
  candidate_email: string;
  percentage: number;
  total_score: number;
  max_score: number;
  evaluation_level: EvaluationLevel | null;
  ai_recommendation: AIRecommendation;
  admin_override_recommendation: AIRecommendation | null;
  evaluated_at: string;
  passing_marks: number | null;
  passed: boolean | null;
}

export interface LeaderboardData {
  jd_id: string;
  job_title: string;
  total_candidates: number;
  avg_percentage: number;
  pass_rate: number | null;
  entries: LeaderboardEntry[];
}

// ─── Global leaderboard (all JDs combined) ────────────────────

export interface GlobalLeaderboardEntry {
  rank: number;
  attempt_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_id?: string | null;
  candidate_phone?: string | null;
  candidate_linkedin_url?: string | null;
  candidate_resume_url?: string | null;
  candidate_number?: number | null;
  invited_by_id?: string | null;
  invited_by_name?: string | null;
  invited_by_email?: string | null;
  company_name?: string | null;
  ai_likeness_percentage?: number | null;
  flagged_answer_count?: number;
  jd_id: string;
  jd_title: string;
  test_id: string;
  test_type: string;
  test_title: string;
  percentage: number;
  total_score: number;
  max_score: number;
  mcq_score: number;
  mcq_max: number;
  open_ended_score: number;
  open_ended_max: number;
  evaluation_level: EvaluationLevel | null;
  ai_recommendation: AIRecommendation;
  admin_override_recommendation: AIRecommendation | null;
  ai_summary: string | null;
  evaluated_at: string;
  passing_marks: number | null;
  passed: boolean | null;
}

export interface GlobalLeaderboardData {
  total_candidates: number;
  entries: GlobalLeaderboardEntry[];
}

export interface SystemReport {
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
}

export interface EvaluationSummary {
  id: string;
  attempt_id: string;
  total_score: number;
  max_score: number;
  percentage: number;
  ai_recommendation: AIRecommendation;
  admin_override_recommendation: AIRecommendation | null;
  is_preliminary: boolean;
  evaluated_at: string;
}

// ─── Request types ────────────────────────────────────────────

export interface TriggerEvaluationRequest {
  attempt_id: string;
}

export interface AdminOverrideRequest {
  recommendation?: AIRecommendation | null;
  notes?: string | null;
}

// ─── UI helpers ───────────────────────────────────────────────

export const RECOMMENDATION_CONFIG: Record<
  AIRecommendation,
  { label: string; color: string; bgColor: string; borderColor: string; emoji: string }
> = {
  STRONG_HIRE: {
    label: "Strong Hire",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    emoji: "🟢",
  },
  HIRE: {
    label: "Hire",
    color: "text-success-dark",
    bgColor: "bg-success-light",
    borderColor: "border-success/20",
    emoji: "✅",
  },
  MAYBE: {
    label: "Maybe",
    color: "text-warning-dark",
    bgColor: "bg-warning-light",
    borderColor: "border-warning/20",
    emoji: "🟡",
  },
  NO_HIRE: {
    label: "No Hire",
    color: "text-danger-dark",
    bgColor: "bg-danger-light",
    borderColor: "border-danger/20",
    emoji: "🔴",
  },
};

export const RECOMMENDATION_THRESHOLDS: Record<
  AIRecommendation,
  { range: string; description: string }
> = {
  STRONG_HIRE: { range: "≥ 80%", description: "Exceptional candidate — strongly recommended" },
  HIRE:        { range: "65 – 79%", description: "Good fit — recommended for hire" },
  MAYBE:       { range: "45 – 64%", description: "Borderline — further review needed" },
  NO_HIRE:     { range: "< 45%", description: "Not recommended at this time" },
};

export function getScoreColor(percentage: number): string {
  if (percentage >= 80) return "text-emerald-600";
  if (percentage >= 65) return "text-success-dark";
  if (percentage >= 45) return "text-warning-dark";
  return "text-danger";
}

export function getScoreBgColor(percentage: number): string {
  if (percentage >= 80) return "bg-emerald-50";
  if (percentage >= 65) return "bg-success-light";
  if (percentage >= 45) return "bg-warning-light";
  return "bg-danger-light";
}

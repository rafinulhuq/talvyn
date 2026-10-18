/**
 * TypeScript types for the sectioned question-bank exam module.
 * Mirrors app/schemas/exam.py (Master Prompt 2/3).
 */

import type { QuestionForCandidate } from "@/types/attempt";

export type SectionType = "REASONING" | "PRACTICAL" | "TECHNICAL";

export const SECTION_ORDER: SectionType[] = ["REASONING", "PRACTICAL", "TECHNICAL"];

export const SECTION_LABELS: Record<SectionType, string> = {
  REASONING: "Reasoning",
  PRACTICAL: "Practical",
  TECHNICAL: "Technical",
};

// ─── Candidate: start / section / status ───────────────────────

export interface StartExamRequest {
  token: string;
}

export interface ExamSectionResponse {
  exam_attempt_id: string;
  attempt_id: string; // underlying TestAttempt id — used for save/heartbeat/event/terminate
  section_type: SectionType;
  section_index: number; // 1-based
  total_sections: number;
  test_title: string;
  duration_seconds: number;
  total_questions: number;
  questions: QuestionForCandidate[];
  started_at: string;
  saved_answers: Record<string, string>;
  exam_status: string;
}

export interface SectionSubmitResponse {
  exam_attempt_id: string;
  section_type: SectionType;
  section_submitted: boolean;
  next_section_type: SectionType | null;
  exam_status: string;
  message: string;
}

export interface ExamSubmitResponse {
  exam_attempt_id: string;
  exam_status: string;
  submitted_at: string | null;
  message: string;
}

export interface ExamStatusResponse {
  exam_attempt_id: string;
  status: string;
  current_section_type: SectionType | null;
  sections_completed: number;
  total_sections: number;
  total_score: number | null;
  mcq_score: number | null;
  cq_score: number | null;
  ai_risk_score: number | null;
}

// ─── Admin: question bank ───────────────────────────────────────

export interface GenerateBankRequest {
  mcq_target?: number | null;
  cq_target?: number | null;
}

export interface BankSectionStatus {
  mcq: number;
  cq: number;
  meets_minimum: boolean;
  meets_commercial_recommended: boolean;
}

export interface BankStatusResponse {
  exists: boolean;
  bank_id: string | null;
  status: "DRAFT" | "GENERATING" | "READY" | "FAILED" | "ARCHIVED" | null;
  ready: boolean;
  below_recommended: boolean;
  is_approved: boolean;
  sections: Partial<Record<SectionType, BankSectionStatus>>;
}

export interface ReviewBankRequest {
  reviewer_model?: string | null;
}

export interface UpdateBankConfigRequest {
  mcq_target?: number | null;
  cq_target?: number | null;
  section_weights?: Partial<Record<SectionType, number>> | null;
}

// ─── Templates (reusable question-bank config library) ───────────

export interface ExamTemplate {
  id: string;
  name: string;
  description: string | null;
  config_json: UpdateBankConfigRequest;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExamTemplateListResponse {
  items: ExamTemplate[];
}

export interface CreateExamTemplateRequest extends UpdateBankConfigRequest {
  name: string;
  description?: string | null;
}

export interface UpdateExamTemplateRequest extends UpdateBankConfigRequest {
  name?: string | null;
  description?: string | null;
}

// ─── Admin: reports ──────────────────────────────────────────────

export type AiLikenessRisk = "low" | "medium" | "high";

export interface AiRiskSignalEntry {
  signal_type: string;
  risk_points: number;
  value: unknown;
}

export interface SectionScoreBreakdown {
  mcq_score: number;
  mcq_max: number;
  mcq_pct: number;
  cq_score: number;
  cq_max: number;
  cq_pct: number;
  section_score: number;
  weight: number;
}

export interface ExamAttemptReportResponse {
  exam_attempt_id: string;
  candidate_id: string;
  jd_id: string;
  status: string;
  total_score: number | null;
  mcq_score: number | null;
  cq_score: number | null;
  section_scores: Partial<Record<SectionType, SectionScoreBreakdown>>;
  ai_risk_score: number | null;
  ai_likeness_risk: AiLikenessRisk | null;
  ai_risk_reasons: string[];
  ai_risk_signals: AiRiskSignalEntry[];
  ai_risk_explanation: string | null;
  ai_risk_disclaimer: string;
}

export interface ExamCandidateListItem {
  exam_attempt_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  total_score: number | null;
  ai_risk_score: number | null;
  assigned_at: string;
  submitted_at: string | null;
}

export interface ExamCandidateListResponse {
  jd_id: string;
  total: number;
  items: ExamCandidateListItem[];
}

export interface ExamResultItem extends ExamCandidateListItem {
  rank: number;
}

export interface ExamResultsResponse {
  jd_id: string;
  total: number;
  items: ExamResultItem[];
}

// ─── UI helpers ───────────────────────────────────────────────

export const EXAM_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Not started",
  STARTED: "In progress",
  SECTION_SUBMITTED: "In progress",
  SUBMITTED: "Submitted — awaiting evaluation",
  EVALUATING: "Evaluating",
  EVALUATED: "Completed",
  FAILED: "Evaluation failed",
};

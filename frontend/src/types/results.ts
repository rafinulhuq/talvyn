/**
 * TypeScript types for the Results Inbox.
 * Mirrors app/schemas/evaluation.py ResultsInboxItem/ResultsInboxResponse.
 */

import type { AIRecommendation, EvaluationLevel } from "./evaluation";

export type ResultsInboxAttemptStatus = "SUBMITTED" | "EVALUATED" | "TERMINATED";

export interface ResultsInboxItem {
  attempt_id: string;
  attempt_status: ResultsInboxAttemptStatus;
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
  recommendation: AIRecommendation | null;
  evaluation_level: EvaluationLevel | null;
}

export interface ResultsInboxResponse {
  items: ResultsInboxItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ResultsInboxFilters {
  page: number;
  search: string;
  jd_id: string;
  status: string;
  recommendation: string;
  integrity: string;
  date_from: string;
  date_to: string;
}

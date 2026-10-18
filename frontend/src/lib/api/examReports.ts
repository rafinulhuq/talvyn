/**
 * Exam admin report API functions (Master Prompt 2/3).
 * All calls to /api/v1/exam-admin/*, via the authenticated admin proxy.
 */

import { apiClient, type ApiResult } from "./client";
import type {
  ExamAttemptReportResponse,
  ExamCandidateListResponse,
  ExamResultsResponse,
} from "@/types/exam";

export const examReportsApi = {
  /** Full report for one candidate's sectioned exam: scores, section
   * breakdown, and the hedged AI-risk summary (never call without showing
   * ai_risk_disclaimer alongside it). Pass deepReview=true to also request
   * the optional GLM explanation (admin-requested deep review). */
  async getReport(
    examAttemptId: string,
    deepReview = false
  ): Promise<ApiResult<ExamAttemptReportResponse>> {
    return apiClient.get<ExamAttemptReportResponse>(
      `/api/v1/exam-admin/attempts/${examAttemptId}/report${deepReview ? "?deep_review=true" : ""}`
    );
  },

  /** Re-queue evaluation for an exam stuck in FAILED status. Candidate
   * answers are never at risk — this just re-runs scoring from scratch. */
  async retryEvaluation(examAttemptId: string): Promise<ApiResult<ExamAttemptReportResponse>> {
    return apiClient.post<ExamAttemptReportResponse>(
      `/api/v1/exam-admin/attempts/${examAttemptId}/retry-evaluation`
    );
  },

  /** Every candidate's sectioned-exam attempt for a job. */
  async listCandidates(jdId: string): Promise<ApiResult<ExamCandidateListResponse>> {
    return apiClient.get<ExamCandidateListResponse>(`/api/v1/exam-admin/jd/${jdId}/candidates`);
  },

  /** Sectioned-exam results for a job, ranked by total score. */
  async listResults(jdId: string): Promise<ApiResult<ExamResultsResponse>> {
    return apiClient.get<ExamResultsResponse>(`/api/v1/exam-admin/jd/${jdId}/results`);
  },
};

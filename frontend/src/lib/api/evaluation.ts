/**
 * Evaluation API client functions.
 */

import { apiClient, type ApiResult } from "./client";
import type {
  AdminOverrideRequest,
  Evaluation,
  EvaluationSummary,
  GlobalLeaderboardData,
  LeaderboardData,
  SystemReport,
  TriggerEvaluationRequest,
} from "@/types/evaluation";

export interface AdminQuestionScoreRequest {
  question_feedback_id: string;
  admin_score: number | null;
}

export const evaluationApi = {
  /**
   * Trigger AI evaluation for a submitted attempt.
   * Synchronous — waits for all Ollama calls (30–120s).
   */
  async trigger(
    req: TriggerEvaluationRequest
  ): Promise<ApiResult<Evaluation>> {
    return apiClient.post<Evaluation>(
      "/api/v1/evaluation/trigger",
      req,
      { timeout: 180_000 } // 3 min — multiple OE questions
    );
  },

  /**
   * Get full evaluation with per-question feedback.
   */
  async get(attemptId: string): Promise<ApiResult<Evaluation>> {
    return apiClient.get<Evaluation>(`/api/v1/evaluation/${attemptId}`);
  },

  /**
   * Get lightweight evaluation summary.
   */
  async getSummary(attemptId: string): Promise<ApiResult<EvaluationSummary>> {
    return apiClient.get<EvaluationSummary>(
      `/api/v1/evaluation/${attemptId}/summary`
    );
  },

  /**
   * Admin overrides AI recommendation and/or adds notes.
   */
  async override(
    attemptId: string,
    req: AdminOverrideRequest
  ): Promise<ApiResult<Evaluation>> {
    return apiClient.patch<Evaluation>(
      `/api/v1/evaluation/${attemptId}/override`,
      req
    );
  },

  /**
   * Get global leaderboard — all evaluated candidates across every JD.
   */
  async getGlobalLeaderboard(params?: {
    user_id?: string;
    company?: string;
  }): Promise<ApiResult<GlobalLeaderboardData>> {
    const searchParams = new URLSearchParams();
    if (params?.user_id) searchParams.set("user_id", params.user_id);
    if (params?.company) searchParams.set("company", params.company);
    const qs = searchParams.toString();
    return apiClient.get<GlobalLeaderboardData>(
      `/api/v1/evaluation/leaderboard${qs ? `?${qs}` : ""}`
    );
  },

  /**
   * Get leaderboard for all candidates evaluated for a JD.
   */
  async getLeaderboard(jdId: string): Promise<ApiResult<LeaderboardData>> {
    return apiClient.get<LeaderboardData>(`/api/v1/evaluation/leaderboard/${jdId}`);
  },

  /**
   * Get aggregate system report for a JD.
   */
  async getSystemReport(jdId: string): Promise<ApiResult<SystemReport>> {
    return apiClient.get<SystemReport>(`/api/v1/evaluation/system-report/${jdId}`);
  },

  /**
   * Download the JD-level aggregate report as a DOCX blob
   * (aggregate analytics + ranked candidate roster).
   */
  async exportSystemReport(jdId: string): Promise<ApiResult<Blob>> {
    return apiClient.get<Blob>(
      `/api/v1/evaluation/system-report/${jdId}/export`,
      { responseType: "blob" }
    );
  },

  /**
   * Admin sets a manual score for a specific question.
   */
  async setQuestionScore(
    attemptId: string,
    req: AdminQuestionScoreRequest
  ): Promise<ApiResult<Evaluation>> {
    return apiClient.patch<Evaluation>(
      `/api/v1/evaluation/${attemptId}/question-score`,
      req
    );
  },

};

export interface TriggerAndPollResult {
  success: boolean;
  data?: Evaluation;
  message?: string;
}

/**
 * Trigger evaluation, and if the proxy times out before the backend job
 * finishes, poll for the result instead of a single retry — the job keeps
 * running server-side, so the page should catch up once it's done.
 */
export async function triggerAndPollEvaluation(
  attemptId: string
): Promise<TriggerAndPollResult> {
  const result = await evaluationApi.trigger({ attempt_id: attemptId });
  if (result.success) {
    return { success: true, data: result.data };
  }

  const statusCode = result.statusCode;
  const code = result.error.code;
  if (statusCode !== 504 && statusCode !== 0 && code !== "TIMEOUT") {
    return { success: false, message: result.error.message ?? "Evaluation failed." };
  }

  const POLL_INTERVAL_MS = 5_000;
  const MAX_POLLS = 120; // ~10 min, matching the proxy's own long-task budget
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const poll = await evaluationApi.get(attemptId);
    if (poll.success) {
      return { success: true, data: poll.data };
    }
    const pollStatus = poll.statusCode;
    if (pollStatus !== 404 && pollStatus !== 0) {
      break; // a real error, not just "still processing" — stop polling
    }
  }
  return {
    success: false,
    message: "Evaluation is taking longer than expected. Refresh this page in a minute to check again.",
  };
}

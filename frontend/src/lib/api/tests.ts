/**
 * Tests API functions — all calls to /api/v1/tests/*.
 */

import { apiClient, type ApiResult } from "./client";
import type {
  GenerateTestsResponse,
  Test,
  TestSummary,
  UpdateQuestionRequest,
  UpdateTestRequest,
  Question,
} from "@/types/test";

export const testsApi = {
  /** Generate 3 tests for an analyzed JD. Blocks until complete (2–6 min). */
  async generate(
    jdId: string,
    difficultyDistribution?: { easy_percent: number; medium_percent: number; hard_percent: number },
  ): Promise<ApiResult<GenerateTestsResponse>> {
    return apiClient.post<GenerateTestsResponse>(
      `/api/v1/tests/generate/${jdId}`,
      { difficulty_distribution: difficultyDistribution ?? null },
      { timeout: 400_000 }, // 6.5 minutes — 3 tests × ~2 min each
    );
  },

  /** List test summaries for a JD. */
  async listForJd(jdId: string): Promise<ApiResult<TestSummary[]>> {
    return apiClient.get<TestSummary[]>(`/api/v1/tests/jd/${jdId}`);
  },

  /** Get a single test with all questions. */
  async get(testId: string): Promise<ApiResult<Test>> {
    return apiClient.get<Test>(`/api/v1/tests/${testId}`);
  },

  /** Update test metadata (title, description, duration, difficulty). */
  async update(testId: string, data: UpdateTestRequest): Promise<ApiResult<Test>> {
    return apiClient.patch<Test>(`/api/v1/tests/${testId}`, data);
  },

  /** Set test status: APPROVED, DRAFT, or ARCHIVED. */
  async setStatus(
    testId: string,
    status: "APPROVED" | "DRAFT" | "ARCHIVED"
  ): Promise<ApiResult<Test>> {
    return apiClient.post<Test>(`/api/v1/tests/${testId}/status`, { status });
  },

  /** Regenerate questions for one test slot. Blocks until complete (~2 min). */
  async regenerate(testId: string): Promise<ApiResult<Test>> {
    return apiClient.post<Test>(
      `/api/v1/tests/${testId}/regenerate`,
      {},
      { timeout: 200_000 }
    );
  },

  /** Cancel in-progress test generation and reset the JD to IDLE. */
  async cancelGeneration(jdId: string): Promise<ApiResult<{ jd_id: string; generation_status: string }>> {
    return apiClient.post(`/api/v1/tests/cancel/${jdId}`, {});
  },

  /**
   * Delete a test and its questions. Blocked with a 409 (error.details
   * .in_use_question_ids) if any question is already assigned to a
   * candidate's exam attempt — pass force to delete anyway.
   */
  async delete(testId: string, force = false): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`/api/v1/tests/${testId}`, { params: { force } });
  },

  /** Delete several tests (and their questions) in one call. Same in-use guard. */
  async bulkDeleteTests(
    testIds: string[],
    force = false
  ): Promise<ApiResult<{ deleted_count: number }>> {
    return apiClient.post<{ deleted_count: number }>(`/api/v1/tests/bulk-delete`, {
      test_ids: testIds,
      force,
    });
  },

  /** Edit a single question's content. */
  async updateQuestion(
    questionId: string,
    data: UpdateQuestionRequest
  ): Promise<ApiResult<Question>> {
    return apiClient.patch<Question>(
      `/api/v1/tests/questions/${questionId}`,
      data
    );
  },

  /** Delete a single question. Same in-use guard as `delete()`. */
  async deleteQuestion(questionId: string, force = false): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`/api/v1/tests/questions/${questionId}`, {
      params: { force },
    });
  },

  /** Delete several questions from one test in a single call. Same in-use guard. */
  async bulkDeleteQuestions(
    testId: string,
    questionIds: string[],
    force = false
  ): Promise<ApiResult<{ deleted_count: number }>> {
    return apiClient.post<{ deleted_count: number }>(
      `/api/v1/tests/${testId}/questions/bulk-delete`,
      { question_ids: questionIds, force }
    );
  },
};

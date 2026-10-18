/**
 * Exam Template ("Templates") API functions — admin side.
 * All calls to /api/v1/templates/*, via the authenticated admin proxy
 * (apiClient), same pattern as questionBank.ts.
 */

import { apiClient, type ApiResult } from "./client";
import type {
  CreateExamTemplateRequest,
  ExamTemplate,
  ExamTemplateListResponse,
  UpdateExamTemplateRequest,
} from "@/types/exam";

export const examTemplatesApi = {
  async list(includeArchived = false): Promise<ApiResult<ExamTemplateListResponse>> {
    return apiClient.get<ExamTemplateListResponse>(
      `/api/v1/templates/?include_archived=${includeArchived}`
    );
  },

  async get(id: string): Promise<ApiResult<ExamTemplate>> {
    return apiClient.get<ExamTemplate>(`/api/v1/templates/${id}`);
  },

  async create(req: CreateExamTemplateRequest): Promise<ApiResult<ExamTemplate>> {
    return apiClient.post<ExamTemplate>(`/api/v1/templates/`, req);
  },

  async update(id: string, req: UpdateExamTemplateRequest): Promise<ApiResult<ExamTemplate>> {
    return apiClient.patch<ExamTemplate>(`/api/v1/templates/${id}`, req);
  },

  async archive(id: string): Promise<ApiResult<ExamTemplate>> {
    return apiClient.post<ExamTemplate>(`/api/v1/templates/${id}/archive`, {});
  },

  async remove(id: string): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`/api/v1/templates/${id}`);
  },
};

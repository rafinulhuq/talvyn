import { apiClient, type ApiResult } from "./client";
import type {
  CandidateAttemptsResponse,
  CandidateListResponse,
  CandidateProfileResponse,
} from "@/types/candidate";

export const candidatesApi = {
  async list(
    page = 1,
    pageSize = 20,
    search?: string
  ): Promise<ApiResult<CandidateListResponse>> {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (search?.trim()) params.set("search", search.trim());
    // No trailing slash before the query string — the catch-all proxy route
    // (/api/proxy/[...path]) reconstructs the upstream path by joining
    // Next.js's captured segments, which never include a trailing slash
    // regardless of what's requested here. Calling with one anyway just
    // adds an avoidable browser-level 308 redirect (Next.js's own
    // trailingSlash:false default normalizing the incoming proxy URL)
    // before the request even reaches the proxy handler.
    return apiClient.get<CandidateListResponse>(`/api/v1/candidates?${params}`);
  },

  async get(candidateId: string): Promise<ApiResult<CandidateProfileResponse>> {
    return apiClient.get<CandidateProfileResponse>(`/api/v1/candidates/${candidateId}`);
  },

  async attempts(candidateId: string): Promise<ApiResult<CandidateAttemptsResponse>> {
    return apiClient.get<CandidateAttemptsResponse>(
      `/api/v1/candidates/${candidateId}/attempts`
    );
  },

  /** Soft-delete a candidate (moves them to the Trash). */
  async remove(candidateId: string): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`/api/v1/candidates/${candidateId}`);
  },
};

/**
 * Public Assessment Link API client functions (admin, authenticated).
 *
 * The /resolve/{slug} and /{slug}/register endpoints are PUBLIC and are
 * called from the candidate browser instead through /api/public/... —
 * see frontend/src/app/api/public/[...path]/route.ts. This client is only
 * for the admin-authenticated create/list/update endpoints.
 */

import { apiClient, type ApiResult } from "./client";
import type {
  CreatePublicLinkRequest,
  PublicAssessmentLink,
  PublicLinkAnalytics,
  PublicLinkListResponse,
  UpdatePublicLinkRequest,
} from "@/types/public_link";

export const publicLinksApi = {
  /**
   * Create a new public link for a JD, or return the existing ACTIVE one.
   * Requires at least one APPROVED test to exist for the JD.
   */
  async createOrGet(
    jdId: string,
    data: CreatePublicLinkRequest = {}
  ): Promise<ApiResult<PublicAssessmentLink>> {
    return apiClient.post<PublicAssessmentLink>(`/api/v1/public-links/jd/${jdId}`, data);
  },

  /**
   * List all public links ever created for a JD.
   */
  async listForJd(jdId: string): Promise<ApiResult<PublicLinkListResponse>> {
    return apiClient.get<PublicLinkListResponse>(`/api/v1/public-links/jd/${jdId}`);
  },

  /**
   * Enable/disable a link, or change its expiry / registration cap.
   */
  async update(
    linkId: string,
    data: UpdatePublicLinkRequest
  ): Promise<ApiResult<PublicAssessmentLink>> {
    return apiClient.patch<PublicAssessmentLink>(`/api/v1/public-links/${linkId}`, data);
  },

  /**
   * Funnel analytics for one link: views, registrations, starts,
   * completions, and a recommendation/pass-rate breakdown of whatever has
   * been evaluated so far.
   */
  async getAnalytics(linkId: string): Promise<ApiResult<PublicLinkAnalytics>> {
    return apiClient.get<PublicLinkAnalytics>(`/api/v1/public-links/${linkId}/analytics`);
  },
};

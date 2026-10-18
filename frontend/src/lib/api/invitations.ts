/**
 * Invitations API client functions.
 *
 * Note on token validation:
 * The /validate/{token} endpoint is PUBLIC (no auth header).
 * All admin endpoints require X-Internal-Token.
 */

import { apiClient, type ApiResult } from "./client";
import type {
  BulkInviteRequest,
  BulkInviteResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  Invitation,
  InvitationListResponse,
  ResendResponse,
  TokenValidationResponse,
} from "@/types/invitation";

export const invitationsApi = {
  /**
   * Send a test invitation to a candidate.
   * Requires at least one APPROVED test to exist for the JD.
   */
  async create(
    data: CreateInvitationRequest
  ): Promise<ApiResult<CreateInvitationResponse>> {
    return apiClient.post<CreateInvitationResponse>("/api/v1/invitations", data);
  },

  /**
   * List all invitations for a JD (paginated).
   * Auto-expires stale invitations on the server before returning.
   */
  async listForJd(
    jdId: string,
    page = 1,
    pageSize = 20
  ): Promise<ApiResult<InvitationListResponse>> {
    return apiClient.get<InvitationListResponse>(
      `/api/v1/invitations/jd/${jdId}?page=${page}&page_size=${pageSize}`
    );
  },

  /**
   * Get a single invitation by ID.
   */
  async get(invitationId: string): Promise<ApiResult<Invitation>> {
    return apiClient.get<Invitation>(`/api/v1/invitations/${invitationId}`);
  },

  /**
   * Validate a magic link token (PUBLIC — no auth).
   * Called from the candidate's browser when they open the link.
   * Pass markOpened=false to check without consuming the "first open" state.
   */
  async validateToken(
    token: string,
    markOpened = true
  ): Promise<ApiResult<TokenValidationResponse>> {
    return apiClient.get<TokenValidationResponse>(
      `/api/v1/invitations/validate/${token}?mark_opened=${markOpened}`
    );
  },

  /**
   * Resend the invitation with a fresh token.
   * Invalidates the old token. Extends expiry by 72h by default.
   */
  async resend(
    invitationId: string,
    extendExpiry = true
  ): Promise<ApiResult<ResendResponse>> {
    return apiClient.post<ResendResponse>(
      `/api/v1/invitations/${invitationId}/resend`,
      { extend_expiry: extendExpiry }
    );
  },

  /**
   * Permanently revoke an invitation. Cannot be undone.
   */
  async revoke(invitationId: string): Promise<ApiResult<void>> {
    return apiClient.post<void>(
      `/api/v1/invitations/${invitationId}/revoke`,
      {}
    );
  },

  /**
   * Bulk-invite multiple candidates from a pre-parsed CSV list (max 50).
   * CSV parsing is done client-side; this sends a JSON body.
   * Per-row results are returned — failures don't abort the batch.
   */
  async bulkInvite(data: BulkInviteRequest): Promise<ApiResult<BulkInviteResponse>> {
    return apiClient.post<BulkInviteResponse>("/api/v1/invitations/bulk", data);
  },
};

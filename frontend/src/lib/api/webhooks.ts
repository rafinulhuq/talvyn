import { apiClient, type ApiResult } from "./client";
import type {
  CreateWebhookResponse,
  WebhookDeliveryListResponse,
  WebhookSubscription,
} from "@/types/webhooks";

export const webhooksApi = {
  // No trailing slash on these two — see the comment in candidates.ts's
  // `list()` for why: the catch-all proxy route never preserves one
  // anyway, so requesting with one just adds an avoidable browser-level
  // redirect hop.
  list(): Promise<ApiResult<WebhookSubscription[]>> {
    return apiClient.get<WebhookSubscription[]>("/api/v1/admin/webhooks");
  },

  create(
    url: string,
    eventTypes: string[]
  ): Promise<ApiResult<CreateWebhookResponse>> {
    return apiClient.post<CreateWebhookResponse>("/api/v1/admin/webhooks", {
      url,
      event_types: eventTypes,
    });
  },

  setActive(id: string, isActive: boolean): Promise<ApiResult<WebhookSubscription>> {
    return apiClient.patch<WebhookSubscription>(`/api/v1/admin/webhooks/${id}`, {
      is_active: isActive,
    });
  },

  remove(id: string): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`/api/v1/admin/webhooks/${id}`);
  },

  listDeliveries(
    id: string,
    page: number = 1,
    pageSize: number = 10
  ): Promise<ApiResult<WebhookDeliveryListResponse>> {
    return apiClient.get<WebhookDeliveryListResponse>(
      `/api/v1/admin/webhooks/${id}/deliveries?page=${page}&page_size=${pageSize}`
    );
  },

  sendTestEvent(id: string): Promise<ApiResult<{ status: string }>> {
    return apiClient.post(`/api/v1/admin/webhooks/${id}/test`);
  },
};

export const WEBHOOK_EVENT_TYPES = [
  "invitation.created",
  "attempt.started",
  "attempt.submitted",
  "attempt.terminated",
  "evaluation.completed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookSubscription {
  id: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookResponse extends WebhookSubscription {
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  event_type: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  response_status_code: number | null;
  attempt_count: number;
  error_message: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface WebhookDeliveryListResponse {
  items: WebhookDelivery[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

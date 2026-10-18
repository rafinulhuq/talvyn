/**
 * Health check API functions.
 * Used on the admin dashboard to surface backend status.
 */

import { apiClient, type ApiResult } from "./client";

export interface HealthLiveResponse {
  status: "ok";
  service: string;
  version: string;
  environment: string;
}

export interface ServiceCheck {
  status: "ok" | "warning" | "error" | "unreachable" | "unknown";
  latency_ms?: number;
  detail?: string;
  action?: string | null;
  backend?: string;
  provider?: string;
  base_url?: string;
  allowed_origins_count?: number;
  model_configured?: string;
  model_available?: boolean;
  available_models?: string[];
  note?: string;
}

export interface HealthReadyResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  checks: {
    database: ServiceCheck;
    redis?: ServiceCheck;
    worker?: ServiceCheck;
    ollama: ServiceCheck;
    storage?: ServiceCheck;
    email?: ServiceCheck;
    magic_links?: ServiceCheck;
    cors?: ServiceCheck;
  };
}

export interface ModelTask {
  model: string;
  tier: "local" | "glm";
}

export interface AIDetectionModelStatus {
  enabled: boolean;
  backend: "llm" | "desklib" | null;
  model: string | null;
}

export interface ActiveModelsResponse {
  test_generation: ModelTask;
  question_bank_generation: ModelTask;
  rubric_generation: ModelTask;
  ai_detection: AIDetectionModelStatus;
}

export const healthApi = {
  async live() {
    return apiClient.get<HealthLiveResponse>("/api/v1/health");
  },

  async models() {
    return apiClient.get<ActiveModelsResponse>("/api/v1/health/models");
  },

  async ready(): Promise<ApiResult<HealthReadyResponse>> {
    try {
      const res = await fetch("/api/proxy/api/v1/health/ready", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as HealthReadyResponse | null;

      if (data?.checks) {
        return { success: true, data };
      }

      return {
        success: false,
        statusCode: res.status,
        error: {
          code: "HEALTH_CHECK_FAILED",
          message: "Could not load system health.",
        },
      };
    } catch (err) {
      return {
        success: false,
        statusCode: 0,
        error: {
          code: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Could not load system health.",
        },
      };
    }
  },
};

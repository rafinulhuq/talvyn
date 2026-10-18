/**
 * Typed API client for communicating with the FastAPI backend.
 *
 * - Automatically includes the NextAuth session token on server-side calls
 * - Handles 401 responses by redirecting to login
 * - Wraps all responses in a consistent Result type
 *
 * Usage:
 *   import { apiClient } from "@/lib/api/client";
 *   const result = await apiClient.get<HealthResponse>("/api/v1/health");
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";

// ─── Types ────────────────────────────────────────────────────

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  statusCode: number;
}

export type ApiResult<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function getStringArrayErrorDetail(
  result: ApiErrorResponse,
  key: string
): string[] | undefined {
  const value = result.error.details?.[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

// ─── Client factory ───────────────────────────────────────────

function createApiClient(): AxiosInstance {
  const baseURL =
    typeof window === "undefined"
      ? // Server-side: call FastAPI directly (avoids network round-trip through Next.js proxy)
        process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000"
      : // Client-side: go through the authenticated Next.js proxy (/api/proxy/...).
        // This proxy adds INTERNAL_API_SECRET server-side — the token must never
        // be exposed to the browser, so /backend/* (which skips auth) won't work.
        "/api/proxy";

  const instance = axios.create({
    baseURL,
    timeout: 30_000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // ── Request interceptor — attach internal token (server-side only) ──────
  // On the server, we call FastAPI directly and must include the secret.
  // On the client, requests go through /api/proxy which adds the secret
  // server-side — the token must never be sent from the browser.
  instance.interceptors.request.use((config) => {
    if (typeof window === "undefined") {
      const secret = process.env.INTERNAL_API_SECRET;
      if (secret && config.headers) {
        config.headers["X-Internal-Token"] = secret;
      }
    }
    return config;
  });

  // ── Response interceptor — normalize errors ────────────────
  instance.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Only redirect on client-side
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
      return Promise.reject(error);
    }
  );

  return instance;
}

const axiosInstance = createApiClient();

// ─── Typed wrapper ────────────────────────────────────────────

async function request<T>(
  config: AxiosRequestConfig
): Promise<ApiResult<T>> {
  try {
    const response = await axiosInstance.request<T>(config);
    return { success: true, data: response.data };
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      const body = error.response.data as
        | {
        success?: boolean;
        error?: { code: string; message: string; details?: Record<string, unknown> };
      }
        | string;
      const fallbackMessage =
        error.response.status === 502
          ? "The server is restarting or temporarily unavailable. Please try again in a few seconds."
          : typeof body === "string" && body.trim()
            ? body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
            : error.message;

      return {
        success: false,
        statusCode: error.response.status,
        error: (typeof body === "object" && body !== null ? body.error : undefined) ?? {
          code: "UNKNOWN_ERROR",
          message: fallbackMessage,
        },
      };
    }

    // Network error or timeout
    return {
      success: false,
      statusCode: 0,
      error: {
        code: "NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Network request failed",
      },
    };
  }
}

// ─── Convenience methods ──────────────────────────────────────

export const apiClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    return request<T>({ ...config, method: "GET", url });
  },

  post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T>> {
    return request<T>({ ...config, method: "POST", url, data });
  },

  patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T>> {
    return request<T>({ ...config, method: "PATCH", url, data });
  },

  put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T>> {
    return request<T>({ ...config, method: "PUT", url, data });
  },

  delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResult<T>> {
    return request<T>({ ...config, method: "DELETE", url });
  },

  // ── Multipart file uploads ─────────────────────────────────
  upload<T>(
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig
  ): Promise<ApiResult<T>> {
    return request<T>({
      ...config,
      method: "POST",
      url,
      data: formData,
      headers: {
        ...config?.headers,
        "Content-Type": "multipart/form-data",
      },
    });
  },
};

import { apiClient, type ApiResult } from "./client";
import type {
  JdParseStatusResponse,
  JdUploadResponse,
  JobDescription,
  JobDescriptionListResponse,
  AnalyzeJdResponse,
} from "@/types/jd";

type ApiErrorBody = {
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  message?: string;
  detail?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiError(value: unknown): value is NonNullable<ApiErrorBody["error"]> {
  if (!isRecord(value)) return false;
  return typeof value.code === "string" && typeof value.message === "string";
}

function parseJsonBody(text: string, fallbackMessage: string): ApiErrorBody & Record<string, unknown> {
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {
      error: {
        code: "INVALID_RESPONSE",
        message: text || fallbackMessage,
      },
    };
  }
}

function getStringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

export interface GenerateJdBrief {
  title: string;
  seniority: string;
  department?: string;
  experience?: string;
  must_have_skills: string[];
  nice_to_have_skills?: string[];
  tools?: string[];
  context?: string;
  tone?: string;
  length?: string;
}

export interface GenerateJdResponse {
  jd_id: string;
  generation_status: string;
  message: string;
}

export const jdApi = {
  async upload(file: File, extractedText?: string | null): Promise<ApiResult<JdUploadResponse>> {
    const formData = new FormData();
    formData.append("file", file);
    if (extractedText) {
      formData.append("extracted_text", extractedText);
    }

    try {
      // IMPORTANT:
      // This calls the Next.js API proxy route.
      // The Next.js route should forward this request to FastAPI:
      // `${BACKEND_URL}/api/v1/jd/upload`
      const res = await fetch("/api/jd/upload", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      const data = parseJsonBody(text, "Server returned an invalid response");

      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          error: isApiError(data.error) ? data.error : {
            code: "UPLOAD_ERROR",
            message: getStringField(data, "message") ?? "Upload failed",
          },
        };
      }

      return {
        success: true,
        data: data as unknown as JdUploadResponse,
      };
    } catch (err) {
      return {
        success: false,
        statusCode: 0,
        error: {
          code: "NETWORK_ERROR",
          message:
            err instanceof Error ? err.message : "Network request failed",
        },
      };
    }
  },

  async list(
    page = 1,
    pageSize = 20
  ): Promise<ApiResult<JobDescriptionListResponse>> {
    return apiClient.get<JobDescriptionListResponse>(
      `/api/v1/jd/?page=${page}&page_size=${pageSize}`
    );
  },

  async get(
    id: string,
    includeRawText = false
  ): Promise<ApiResult<JobDescription>> {
    return apiClient.get<JobDescription>(
      `/api/v1/jd/${id}?include_raw_text=${includeRawText}`
    );
  },

  async getStatus(id: string): Promise<ApiResult<JdParseStatusResponse>> {
    return apiClient.get<JdParseStatusResponse>(
      `/api/v1/jd/${id}/status`
    );
  },

  async delete(id: string, force = false): Promise<ApiResult<void>> {
    return apiClient.delete<void>(`/api/v1/jd/${id}${force ? "?force=true" : ""}`);
  },

  async analyze(id: string): Promise<ApiResult<AnalyzeJdResponse>> {
    // Uses the Next.js proxy route so INTERNAL_API_SECRET stays server-side
    const res = await fetch(`/api/jd/${id}/analyze`, {
      method: "POST",
      signal: AbortSignal.timeout(150_000),
    });

    const text = await res.text();
    const data = parseJsonBody(text, "Invalid response");

    if (!res.ok) {
      return {
        success: false,
        statusCode: res.status,
        error: isApiError(data.error)
          ? data.error
          : { code: "ANALYZE_ERROR", message: getStringField(data, "detail") ?? "Analysis failed" },
      };
    }

    return { success: true, data: data as unknown as AnalyzeJdResponse };
  },

  async generate(brief: GenerateJdBrief): Promise<ApiResult<GenerateJdResponse>> {
    // Dedicated proxy route keeps INTERNAL_API_SECRET server-side.
    const res = await fetch("/api/jd/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await res.text();
    const data = parseJsonBody(text, "Invalid response");

    if (!res.ok) {
      return {
        success: false,
        statusCode: res.status,
        error: isApiError(data.error)
          ? data.error
          : { code: "GENERATE_ERROR", message: getStringField(data, "detail") ?? "Generation failed" },
      };
    }

    return { success: true, data: data as unknown as GenerateJdResponse };
  },

  async updateText(id: string, rawText: string): Promise<ApiResult<JobDescription>> {
    return apiClient.patch<JobDescription>(`/api/v1/jd/${id}/text`, { raw_text: rawText });
  },

  async regenerate(id: string): Promise<ApiResult<GenerateJdResponse>> {
    return apiClient.post<GenerateJdResponse>(`/api/v1/jd/${id}/regenerate`, {});
  },
};

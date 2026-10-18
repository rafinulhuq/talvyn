import { apiClient, type ApiResult } from "./client";
import type {
  AICheckJobAcceptedResponse,
  AICheckJobStatusResponse,
  AICheckRequest,
  AICheckResponse,
  ExtractedTextResponse,
} from "@/types/aiChecker";

type ExtractApiBody = Partial<ExtractedTextResponse> & {
  error?: { code: string; message: string };
};

async function readExtractBody(res: Response): Promise<ExtractApiBody> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {
      error: {
        code: "INVALID_RESPONSE",
        message: text || "Server returned an invalid response",
      },
    };
  }
}

export const aiCheckerApi = {
  check(payload: AICheckRequest): Promise<ApiResult<AICheckResponse>> {
    return apiClient.post<AICheckResponse>("/api/v1/ai-checker/check", payload, {
      timeout: 400_000,
    });
  },

  startCheckJob(
    payload: AICheckRequest
  ): Promise<ApiResult<AICheckJobAcceptedResponse>> {
    return apiClient.post<AICheckJobAcceptedResponse>(
      "/api/v1/ai-checker/jobs",
      payload
    );
  },

  getCheckJob(jobId: string): Promise<ApiResult<AICheckJobStatusResponse>> {
    return apiClient.get<AICheckJobStatusResponse>(
      `/api/v1/ai-checker/jobs/${jobId}`
    );
  },

  /**
   * Server-side PDF/DOCX extraction fallback — used when the in-browser
   * WASM parser fails (complex layouts, certain DOCX structures, etc).
   */
  async extractText(file: File): Promise<ApiResult<ExtractedTextResponse>> {
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Dedicated Next.js upload route. Do not use /api/proxy here: the
      // generic proxy treats bodies as text and is intentionally sized for
      // small JSON requests, while this endpoint forwards binary multipart.
      const res = await fetch("/api/ai-checker/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await readExtractBody(res);
        return {
          success: false,
          statusCode: res.status,
          error: data.error ?? {
            code: "AI_CHECKER_EXTRACT_ERROR",
            message: "Could not extract text from this file.",
          },
        };
      }

      const data = await readExtractBody(res);
      return { success: true, data: { text: data.text ?? "" } };
    } catch (err) {
      return {
        success: false,
        statusCode: 0,
        error: {
          code: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Network request failed",
        },
      };
    }
  },
};

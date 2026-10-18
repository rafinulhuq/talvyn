import { apiClient, type ApiResult } from "./client";
import type {
  ATSCheckRequest,
  ATSCheckResponse,
  ATSExtractedTextResponse,
} from "@/types/ats";

type ExtractApiBody = Partial<ATSExtractedTextResponse> & {
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

export const atsApi = {
  /**
   * Scoring is a synchronous, deterministic pass on the backend — no job to
   * queue and no status to poll, unlike the AI Checker.
   */
  check(payload: ATSCheckRequest): Promise<ApiResult<ATSCheckResponse>> {
    return apiClient.post<ATSCheckResponse>("/api/v1/ats/check", payload);
  },

  /**
   * Server-side PDF/DOCX extraction fallback, used when the in-browser WASM
   * parser returns null. Also reports how the text was obtained: a resume
   * that needed OCR has no text layer at all, which is itself the most
   * important thing the report can tell an admin.
   */
  async extractText(file: File): Promise<ApiResult<ATSExtractedTextResponse>> {
    const formData = new FormData();
    formData.append("file", file);

    try {
      // Dedicated Next.js upload route — the generic /api/proxy is sized for
      // small JSON bodies and treats bodies as text, not binary multipart.
      const res = await fetch("/api/ats/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await readExtractBody(res);
        return {
          success: false,
          statusCode: res.status,
          error: data.error ?? {
            code: "ATS_EXTRACT_ERROR",
            message: "Could not extract text from this file.",
          },
        };
      }

      const data = await readExtractBody(res);
      return {
        success: true,
        data: {
          text: data.text ?? "",
          extraction_method: data.extraction_method ?? "native",
        },
      };
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

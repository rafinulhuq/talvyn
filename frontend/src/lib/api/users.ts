import type { ApiResult } from "./client";

type ApiErrorBody = {
  error?: { code: string; message: string };
};

async function parseErrorBody(res: Response, fallback: string): Promise<{ code: string; message: string }> {
  try {
    const body: ApiErrorBody = await res.json();
    if (body.error?.code && body.error?.message) return body.error;
  } catch {
    // fall through to default below
  }
  return { code: "REQUEST_FAILED", message: fallback };
}

export const usersApi = {
  async uploadAvatar(file: File): Promise<ApiResult<void>> {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/users/me/avatar", { method: "POST", body: formData });
      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          error: await parseErrorBody(res, "Upload failed"),
        };
      }
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        statusCode: 0,
        error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network request failed" },
      };
    }
  },

  async deleteAvatar(): Promise<ApiResult<void>> {
    try {
      const res = await fetch("/api/users/me/avatar", { method: "DELETE" });
      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          error: await parseErrorBody(res, "Could not remove the profile picture"),
        };
      }
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        statusCode: 0,
        error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network request failed" },
      };
    }
  },
};

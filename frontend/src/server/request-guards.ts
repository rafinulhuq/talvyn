import type { NextRequest } from "next/server";
import { errorJson } from "@/server/upstream";

/**
 * CSRF defense for cookie-authenticated mutations. The session cookie is
 * SameSite=Lax, which already blocks cross-site POSTs; this adds a second
 * layer: the browser's own Sec-Fetch-Site must not be "cross-site", and the
 * body must be JSON (HTML forms can't send application/json cross-origin
 * without a CORS preflight).
 */
export function rejectUnsafeMutation(req: NextRequest, { requireJson = true } = {}) {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return errorJson(403, "CROSS_SITE_REQUEST", "This request must come from the Talvyn app.");
  }
  if (requireJson && !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorJson(415, "UNSUPPORTED_MEDIA_TYPE", "Send this request as JSON.");
  }
  return null;
}

export async function readJson(req: NextRequest): Promise<unknown> {
  return req.json().catch(() => null);
}

import type { NextRequest } from "next/server";
import { isSafeId, requireUser } from "@/server/auth/require-user";
import { backendBaseUrl, internalHeaders } from "@/server/internal-api";
import { relayJson } from "@/server/uploads";
import { errorJson } from "@/server/upstream";

// Skill analysis can take ~2 minutes on a cold model; fetch is fine under undici's 300s limit.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!isSafeId(id)) return errorJson(404, "NOT_FOUND", "Job description not found.");
  try {
    const upstream = await fetch(`${backendBaseUrl()}/api/v1/jd/${id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders(auth.user.id) },
      signal: AbortSignal.timeout(150_000),
    });
    return relayJson(upstream);
  } catch (err) {
    if ((err as Error).name === "TimeoutError") return errorJson(504, "TIMEOUT", "Analysis took too long. Try again.");
    console.error(`[jd/analyze] ${(err as Error).message}`);
    return errorJson(502, "ANALYZE_UNAVAILABLE", "Analysis is unavailable. Try again shortly.");
  }
}

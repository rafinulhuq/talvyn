import type { NextRequest } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { backendBaseUrl, internalHeaders } from "@/server/internal-api";
import { relayJson } from "@/server/uploads";
import { errorJson, readBody } from "@/server/upstream";

// Generate a JD from a short brief. Dedicated route so the uploader id is set server-side.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const read = await readBody(req, 32 * 1024);
  if ("error" in read) return read.error;
  try {
    const upstream = await fetch(`${backendBaseUrl()}/api/v1/jd/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internalHeaders(auth.user.id) },
      body: read.body,
    });
    return relayJson(upstream);
  } catch (err) {
    console.error(`[jd/generate] ${(err as Error).message}`);
    return errorJson(502, "GENERATE_BACKEND_UNAVAILABLE", "Job description generation is unavailable. Try again shortly.");
  }
}

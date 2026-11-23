/**
 * Authenticated pass-through to FastAPI for signed-in dashboard users.
 * The browser never sees INTERNAL_API_SECRET: it calls /api/proxy/<path>, and
 * this route attaches the secret plus the session user's id.
 *
 * Auth uses getToken() (cookie signature check, no NextAuth callbacks) plus one
 * DB re-validation — this is the hot path for autosave, heartbeat and polling.
 */
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { currentSessionUser } from "@/server/auth/session";
import { backendBaseUrl, internalHeaders } from "@/server/internal-api";
import {
  contentTypeHeader,
  errorJson,
  forward,
  jsonFromUpstream,
  readBody,
  safeApiPath,
  upstreamFailure,
  type RouteContext,
} from "@/server/upstream";

const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_TIMEOUT_MS = 600_000; // AI generation / evaluation
const MAX_BODY = 2 * 1024 * 1024; // all traffic here is JSON; file uploads have dedicated routes
const RESTORE_MAX_BODY = 50 * 1024 * 1024;

// Internal-only backend routes (e.g. /api/v1/internal/emails/*) are reached
// solely via server-side helpers. Never forward them for a browser user.
const BLOCKED = /^\/api\/v1\/internal(\/|$)/;

function timeoutFor(path: string): number {
  const long =
    path.includes("/generate/") ||
    path.includes("/regenerate") ||
    path.includes("/evaluation/trigger") ||
    path.includes("/ai-checker/check") ||
    path.endsWith("/question-bank/generate") ||
    path.endsWith("/question-bank/regenerate");
  return long ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

async function handle(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const user = token ? await currentSessionUser(token) : null;
  if (!user) return errorJson(401, "UNAUTHORIZED", "Your session has ended. Sign in again.");

  const apiPath = safeApiPath((await params).path);
  if (!apiPath || BLOCKED.test(apiPath)) return errorJson(404, "NOT_FOUND", "Not found.");

  let headers: Record<string, string>;
  try {
    headers = { ...internalHeaders(user.id), ...contentTypeHeader(req) };
  } catch {
    console.error("[api/proxy] Misconfigured: FASTAPI_INTERNAL_URL or INTERNAL_API_SECRET is not set.");
    return errorJson(500, "PROXY_MISCONFIGURED", "Server misconfiguration.");
  }

  try {
    // SSE: stream straight through. fetch is fine here — headers arrive immediately.
    if (apiPath.endsWith("/stream")) {
      const upstream = await fetch(`${backendBaseUrl()}${apiPath}${req.nextUrl.search}`, {
        method: req.method,
        headers,
        signal: req.signal,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    let body: string | undefined;
    if (!["GET", "HEAD", "DELETE"].includes(req.method)) {
      const read = await readBody(req, apiPath.includes("/admin/restore-data") ? RESTORE_MAX_BODY : MAX_BODY);
      if ("error" in read) return read.error;
      body = read.body;
    }

    const binary = apiPath.includes("/export"); // DOCX/CSV exports
    const res = await forward(req, apiPath, { headers, body, timeoutMs: timeoutFor(apiPath), binary });

    if (binary && res.status === 200) {
      const out: Record<string, string> = {
        "Content-Type": String(res.headers["content-type"] ?? "application/octet-stream"),
      };
      const disposition = res.headers["content-disposition"];
      if (disposition) out["Content-Disposition"] = String(disposition);
      return new NextResponse(res.data as ArrayBuffer, { status: 200, headers: out });
    }
    return jsonFromUpstream(res);
  } catch (err) {
    return upstreamFailure("api/proxy", err);
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };

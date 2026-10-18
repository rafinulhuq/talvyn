/**
 * Authenticated catch-all proxy: /api/proxy/[...path]
 *
 * Forwards any method to FastAPI with the server-side INTERNAL_API_SECRET.
 * Client-side components use this instead of hitting /backend/* directly,
 * because the internal token must not be exposed to the browser.
 *
 * Usage (client-side baseURL):  /api/proxy  →  proxied to FastAPI
 * Usage (server-side baseURL):  http://localhost:8000  →  direct (no proxy needed)
 *
 * Auth strategy — P1-4 optimisation:
 *   We use getToken() (next-auth/jwt) instead of getServerSession(authOptions).
 *   authOptions already uses strategy:"jwt", so there is no DB lookup either way,
 *   but getServerSession() still runs the jwt + session callbacks and allocates a
 *   full session object on every request.  getToken() skips all callbacks — it only
 *   reads the cookie and verifies the HMAC signature, which is a pure in-process
 *   crypto operation.  On high-frequency paths (autosave every 10 s, heartbeat
 *   every 30 s, status polling every 15 s) this removes meaningless CPU work.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { currentSessionUser } from "@/lib/auth/sessionState";
import axios, { AxiosError } from "axios";

const LONG_TIMEOUT = 600_000; // 10 min — test generation, question bank generation/regeneration
const DEFAULT_TIMEOUT = 30_000;
const ADMIN_RESTORE_MAX_BODY_BYTES = 50 * 1024 * 1024;
// Every call through this proxy is small JSON (admin CRUD, bulk-invite rows
// capped at 50 server-side, etc.) — actual file uploads go through the
// dedicated /api/jd/upload route, never through here. 2MB is generous
// headroom while bounding what an authenticated-but-misbehaving client (or a
// future bug) can push through on every request.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// NOTE: We use axios instead of fetch here.
// Node's built-in fetch uses undici which has a hard 300_000ms headersTimeout
// that fires before our LONG_TIMEOUT, causing UND_ERR_HEADERS_TIMEOUT on
// long-running endpoints like /generate/. Axios uses Node's http module
// directly and has no such hidden limit.

function getTimeout(path: string): number {
  if (
    path.includes("/generate/") ||
    path.includes("/regenerate") ||
    path.includes("/evaluation/trigger") || // AI evaluation: 30–120s depending on OE questions
    path.includes("/ai-checker/check") ||
    // Question bank (Master Prompt 2/3): jd_id comes BEFORE "generate" here
    // (.../jd/{jd_id}/question-bank/generate), so it never ends in
    // "/generate/" like the legacy .../tests/generate/{jd_id} shape does —
    // match explicitly instead of relying on a trailing slash.
    path.endsWith("/question-bank/generate") ||
    path.endsWith("/question-bank/regenerate")
  ) {
    return LONG_TIMEOUT;
  }
  return DEFAULT_TIMEOUT;
}

function getMaxBodyBytes(path: string): number {
  if (path.includes("/admin/restore-data")) {
    return ADMIN_RESTORE_MAX_BODY_BYTES;
  }
  return MAX_BODY_BYTES;
}

async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse | Response> {
  try {
    // getToken() decrypts the JWT from the session cookie and verifies the
    // HMAC signature — that's it.  No callbacks, no session object, no DB.
    // token.sub is set by NextAuth to the user's ID (standard JWT "subject").
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.sub || !await currentSessionUser(token)) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const fastapiUrl = process.env.FASTAPI_INTERNAL_URL;
    const internalToken = process.env.INTERNAL_API_SECRET;
    if (!fastapiUrl || !internalToken) {
      // Forwarding with an empty X-Internal-Token used to silently produce
      // whatever generic 401 FastAPI returns for a bad token — making a
      // missing env var indistinguishable from a real auth failure. Fail
      // loudly instead so misconfiguration is obvious in logs/responses.
      console.error(
        "[api/proxy] Misconfigured: FASTAPI_INTERNAL_URL or INTERNAL_API_SECRET is not set."
      );
      return NextResponse.json(
        { error: { code: "PROXY_MISCONFIGURED", message: "Server misconfiguration." } },
        { status: 500 }
      );
    }

    const { path } = await params;
    const apiPath = "/" + path.join("/");

    // Denylist: internal-only backend endpoints are reached exclusively by
    // dedicated server-side routes that attach the internal token directly
    // (e.g. lib/signupNotifications.ts -> /api/v1/internal/emails/*). They are
    // NEVER meant to be callable through this generic browser-facing proxy,
    // which forwards the internal secret for any signed-in user. Blocking the
    // prefix here stops a low-privilege user from, e.g., sending mail to
    // arbitrary recipients. Add new internal-only prefixes as they appear.
    if (/^\/api\/v1\/internal(\/|$)/.test(apiPath)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found." } },
        { status: 404 }
      );
    }

    const search = req.nextUrl.search ?? "";
    const upstreamUrl = `${fastapiUrl}${apiPath}${search}`;

    // Build forwarded headers (strip Next.js-specific ones)
    const forwardedHeaders: Record<string, string> = {
      "X-Internal-Token": internalToken,
      // Forward the authenticated user's DB ID on every proxied request.
      // Backend endpoints that need the caller's identity read these headers:
      //   X-Uploader-Id  → JD upload (rate limiting, ownership)
      //   X-Inviter-Id   → Invitation creation (FK: invitations.invited_by → users.id)
      //   X-Actor-Id     → audit logging for revoke/resend/override/reset/restore
      // token.sub is set by NextAuth to session.user.id (the user's DB UUID).
      "X-Uploader-Id": token.sub,
      "X-Inviter-Id": token.sub,
      "X-Actor-Id": token.sub,
    };
    const contentType = req.headers.get("content-type");
    if (contentType) forwardedHeaders["Content-Type"] = contentType;

    // ── SSE / streaming paths ────────────────────────────────
    // Axios buffers the entire response before returning — SSE would never
    // deliver events until the stream closes.  For /stream endpoints we use
    // native fetch() and pipe the ReadableStream body directly to the client.
    // Headers arrive almost immediately (within ms), so undici's headersTimeout
    // is not a concern here (it only applies until headers are received).
    if (apiPath.endsWith("/stream")) {
      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers: forwardedHeaders,
      });
      // Pipe the upstream ReadableStream straight through — no buffering.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    let body: string | undefined;
    if (!["GET", "HEAD", "DELETE"].includes(req.method)) {
      body = await req.text();
      if (Buffer.byteLength(body, "utf-8") > getMaxBodyBytes(apiPath)) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large." } },
          { status: 413 }
        );
      }
    }

    // Detect binary paths — export endpoints return non-JSON (DOCX, etc.)
    const isBinaryPath = apiPath.includes("/export");

    const upstreamRes = await axios.request({
      url: upstreamUrl,
      method: req.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      headers: forwardedHeaders,
      data: body,
      timeout: getTimeout(apiPath),
      responseType: isBinaryPath ? "arraybuffer" : "text",
      validateStatus: () => true,
      decompress: false,
    });

    // Next.js runtime (undici) throws when constructing Response(null, {status:204}).
    // Remap no-content responses to 200 + empty JSON so the client's axios resolves
    // with { success: true } without special-casing the status code.
    if (upstreamRes.status === 204 || upstreamRes.status === 205) {
      return NextResponse.json({}, { status: 200 });
    }

    // Binary response — forward raw bytes with original headers
    if (isBinaryPath && upstreamRes.status === 200) {
      const contentType = String(upstreamRes.headers["content-type"] ?? "application/octet-stream");
      const contentDisposition = String(upstreamRes.headers["content-disposition"] ?? "");
      const resHeaders: Record<string, string> = { "Content-Type": contentType };
      if (contentDisposition) resHeaders["Content-Disposition"] = contentDisposition;
      return new NextResponse(upstreamRes.data as ArrayBuffer, {
        status: 200,
        headers: resHeaders,
      });
    }

    // JSON response
    let parsedBody: unknown;
    try {
      parsedBody = upstreamRes.data ? JSON.parse(upstreamRes.data as string) : {};
    } catch {
      parsedBody = { raw: upstreamRes.data };
    }

    return NextResponse.json(parsedBody, { status: upstreamRes.status });
  } catch (err: unknown) {
    console.error("[api/proxy] error:", err);

    // axios timeout (ECONNABORTED) or ETIMEDOUT
    if (
      err instanceof AxiosError &&
      (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT")
    ) {
      return NextResponse.json(
        { error: { code: "TIMEOUT", message: "Request timed out." } },
        { status: 504 }
      );
    }

    // the gpu configuration proxy changed
    
    return NextResponse.json(
      { error: { code: "PROXY_ERROR", message: "Proxy request failed." } },
      { status: 500 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;

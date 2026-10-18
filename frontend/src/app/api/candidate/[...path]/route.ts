/**
 * Public candidate proxy: /api/candidate/[...path]
 *
 * Forwards only candidate attempt endpoints to FastAPI. This keeps the
 * candidate browser on the same origin as Next.js, so links work from the
 * production domain, a tunnel, or Vercel without exposing admin proxy
 * credentials.
 *
 * A8-4: the magic-link token lives in an httpOnly cookie (set by
 * middleware when the emailed link was opened), so client JS never sees
 * it. This proxy injects it upstream — as the X-Attempt-Token header on
 * every call, and into the JSON body of the two /start endpoints (which
 * FastAPI reads from the body). A legacy X-Attempt-Token header from a
 * pre-A8-4 tab still wins if present.
 */

import { NextRequest, NextResponse } from "next/server";
import axios, { AxiosError } from "axios";
import { requireServerEnv } from "@/lib/env";
import { getForwardedClientIp } from "@/lib/server/clientIp";
import { ATTEMPT_TOKEN_COOKIE } from "@/lib/candidateSession";

const DEFAULT_TIMEOUT = 30_000;
const MAX_BODY_BYTES = 1024 * 1024;

const START_PATHS = new Set([
  "/api/v1/attempts/start",
  "/api/v1/candidate-exams/start",
]);

/** Add the cookie token to a /start JSON body that doesn't carry one. */
function injectBodyToken(body: string, cookieToken: string): string {
  try {
    const parsed: unknown = body ? JSON.parse(body) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return body;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.token === "string" && record.token.length > 0) {
      return body; // legacy client already supplied it
    }
    return JSON.stringify({ ...record, token: cookieToken });
  } catch {
    return body; // malformed JSON — let FastAPI reject it
  }
}

function isAllowedAttemptPath(apiPath: string, method: string): boolean {
  if (apiPath === "/api/v1/attempts/start") {
    return method === "POST";
  }

  const match = apiPath.match(
    /^\/api\/v1\/attempts\/[^/]+\/(state|answer|bulk-save|heartbeat|submit|event|terminate)$/
  );
  if (match) {
    const action = match[1];
    return action === "state" ? method === "GET" : method === "POST";
  }

  // Sectioned exam flow (Master Prompt 2/3) — same candidate, no admin
  // session, same X-Attempt-Token mechanics as /attempts/* above, just
  // backed by a different FastAPI router (app/api/v1/exams.py).
  if (apiPath === "/api/v1/candidate-exams/start") {
    return method === "POST";
  }
  const examMatch = apiPath.match(
    /^\/api\/v1\/candidate-exams\/[^/]+\/(current|status|submit)$/
  );
  if (examMatch) {
    const action = examMatch[1];
    return action === "submit" ? method === "POST" : method === "GET";
  }
  const sectionSubmitMatch = apiPath.match(
    /^\/api\/v1\/candidate-exams\/[^/]+\/section\/[^/]+\/submit$/
  );
  if (sectionSubmitMatch) {
    return method === "POST";
  }

  return false;
}

async function proxyCandidateRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  try {
    const { path } = await params;
    const apiPath = "/" + path.join("/");

    if (!isAllowedAttemptPath(apiPath, req.method)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found." } },
        { status: 404 }
      );
    }

    const fastapiUrl = requireServerEnv("FASTAPI_INTERNAL_URL", "http://localhost:8000");
    const internalToken = requireServerEnv("INTERNAL_API_SECRET");
    const upstreamUrl = `${fastapiUrl}${apiPath}${req.nextUrl.search}`;

    const forwardedHeaders: Record<string, string> = {
      "X-Internal-Token": internalToken,
    };
    const contentType = req.headers.get("content-type");
    if (contentType) forwardedHeaders["Content-Type"] = contentType;

    const cookieToken = req.cookies.get(ATTEMPT_TOKEN_COOKIE)?.value ?? "";
    const attemptToken = req.headers.get("x-attempt-token") || cookieToken;
    if (attemptToken) forwardedHeaders["X-Attempt-Token"] = attemptToken;

    const clientIp = getForwardedClientIp(req);
    if (clientIp) forwardedHeaders["X-Talvyn-Client-IP"] = clientIp;

    let body: string | undefined;
    if (!["GET", "HEAD"].includes(req.method)) {
      body = await req.text();
      if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large." } },
          { status: 413 }
        );
      }
      if (START_PATHS.has(apiPath) && cookieToken) {
        body = injectBodyToken(body, cookieToken);
      }
    }

    const upstreamRes = await axios.request({
      url: upstreamUrl,
      method: req.method as "GET" | "POST",
      headers: forwardedHeaders,
      data: body,
      timeout: DEFAULT_TIMEOUT,
      responseType: "text",
      validateStatus: () => true,
    });

    let parsedBody: unknown;
    try {
      parsedBody = upstreamRes.data ? JSON.parse(upstreamRes.data as string) : {};
    } catch {
      parsedBody = { raw: upstreamRes.data };
    }

    return NextResponse.json(parsedBody, { status: upstreamRes.status });
  } catch (err: unknown) {
    console.error("[api/candidate] error:", err);

    if (
      err instanceof AxiosError &&
      (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT")
    ) {
      return NextResponse.json(
        { error: { code: "TIMEOUT", message: "Request timed out." } },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: { code: "PROXY_ERROR", message: "Candidate request failed." } },
      { status: 500 }
    );
  }
}

export const GET = proxyCandidateRequest;
export const POST = proxyCandidateRequest;

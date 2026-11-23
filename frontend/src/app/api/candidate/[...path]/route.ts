/**
 * Candidate attempt proxy (no admin session). Only an explicit allowlist of
 * attempt / sectioned-exam endpoints is forwarded.
 *
 * The magic-link token lives in an httpOnly cookie (set by src/proxy.ts) and is
 * injected here: as X-Attempt-Token on every call, and into the JSON body of
 * the two /start endpoints (FastAPI reads it from the body there). A legacy
 * X-Attempt-Token header from an old tab still wins.
 */
import type { NextRequest } from "next/server";
import { ATTEMPT_TOKEN_COOKIE } from "@/lib/candidate-session";
import { getClientIp } from "@/server/client-ip";
import { internalHeaders } from "@/server/internal-api";
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

const TIMEOUT_MS = 30_000;
const MAX_BODY = 1024 * 1024;
const START_PATHS = new Set(["/api/v1/attempts/start", "/api/v1/candidate-exams/start"]);

const ALLOWED: { pattern: RegExp; method: (action: string) => string }[] = [
  { pattern: /^\/api\/v1\/attempts\/start$/, method: () => "POST" },
  {
    pattern: /^\/api\/v1\/attempts\/[^/]+\/(state|answer|bulk-save|heartbeat|submit|event|terminate)$/,
    method: (a) => (a === "state" ? "GET" : "POST"),
  },
  { pattern: /^\/api\/v1\/candidate-exams\/start$/, method: () => "POST" },
  { pattern: /^\/api\/v1\/candidate-exams\/[^/]+\/(current|status|submit)$/, method: (a) => (a === "submit" ? "POST" : "GET") },
  { pattern: /^\/api\/v1\/candidate-exams\/[^/]+\/section\/[^/]+\/submit$/, method: () => "POST" },
];

function isAllowed(path: string, method: string): boolean {
  for (const rule of ALLOWED) {
    const m = path.match(rule.pattern);
    if (m) return rule.method(m[1] ?? "") === method;
  }
  return false;
}

function withBodyToken(body: string, token: string): string {
  try {
    const parsed: unknown = body ? JSON.parse(body) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return body;
    const record = parsed as Record<string, unknown>;
    if (typeof record.token === "string" && record.token) return body;
    return JSON.stringify({ ...record, token });
  } catch {
    return body; // malformed JSON: let FastAPI reject it
  }
}

async function handle(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const apiPath = safeApiPath((await params).path);
  if (!apiPath || !isAllowed(apiPath, req.method)) return errorJson(404, "NOT_FOUND", "Not found.");

  try {
    const cookieToken = req.cookies.get(ATTEMPT_TOKEN_COOKIE)?.value ?? "";
    const attemptToken = req.headers.get("x-attempt-token") || cookieToken;
    const clientIp = getClientIp(req);
    const headers: Record<string, string> = {
      ...internalHeaders(),
      ...contentTypeHeader(req),
      ...(attemptToken ? { "X-Attempt-Token": attemptToken } : {}),
      ...(clientIp ? { "X-Talvyn-Client-IP": clientIp } : {}),
    };

    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const read = await readBody(req, MAX_BODY);
      if ("error" in read) return read.error;
      body = START_PATHS.has(apiPath) && cookieToken ? withBodyToken(read.body, cookieToken) : read.body;
    }

    return jsonFromUpstream(await forward(req, apiPath, { headers, body, timeoutMs: TIMEOUT_MS }));
  } catch (err) {
    return upstreamFailure("api/candidate", err);
  }
}

export { handle as GET, handle as POST };

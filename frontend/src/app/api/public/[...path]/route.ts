/**
 * Public, unauthenticated endpoints: resolving / registering through a public
 * assessment link, and blog claps. Narrow allowlist, small bodies.
 */
import type { NextRequest } from "next/server";
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

const TIMEOUT_MS = 15_000;
const MAX_BODY = 64 * 1024;
// The only cookie FastAPI reads here (backend/app/api/v1/public_links.py). The
// previous proxy forwarded ALL cookies, leaking the session and candidate
// token cookies upstream for no reason.
const DEVICE_COOKIE = "rp_device_id";

function isAllowed(path: string, method: string): boolean {
  if (/^\/api\/v1\/public-links\/resolve\/[^/]+$/.test(path)) return method === "GET";
  if (/^\/api\/v1\/public-links\/[^/]+\/register$/.test(path)) return method === "POST";
  if (/^\/api\/v1\/(?:cmp|cms)\/public\/blog\/[^/]+\/clap$/.test(path)) return method === "POST";
  return false;
}

async function handle(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const apiPath = safeApiPath((await params).path);
  if (!apiPath || !isAllowed(apiPath, req.method)) return errorJson(404, "NOT_FOUND", "Not found.");

  try {
    const clientIp = getClientIp(req);
    const device = req.cookies.get(DEVICE_COOKIE)?.value;
    const headers: Record<string, string> = {
      ...internalHeaders(),
      ...contentTypeHeader(req),
      ...(clientIp ? { "X-Talvyn-Client-IP": clientIp } : {}),
      ...(device ? { Cookie: `${DEVICE_COOKIE}=${device}` } : {}),
    };

    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const read = await readBody(req, MAX_BODY);
      if ("error" in read) return read.error;
      body = read.body;
    }

    const upstream = await forward(req, apiPath, { headers, body, timeoutMs: TIMEOUT_MS });
    const res = jsonFromUpstream(upstream);
    // Pass the device-tracking Set-Cookie through to the browser.
    const setCookie = upstream.headers["set-cookie"];
    for (const c of Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : []) {
      res.headers.append("Set-Cookie", c);
    }
    return res;
  } catch (err) {
    return upstreamFailure("api/public", err);
  }
}

export { handle as GET, handle as POST };

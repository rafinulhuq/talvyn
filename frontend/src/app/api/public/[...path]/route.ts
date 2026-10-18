/**
 * Public assessment-link proxy: /api/public/[...path]
 *
 * Forwards only the public (unauthenticated) FastAPI endpoints used by the
 * candidate registration page — resolving a public link and registering a
 * candidate through one. No INTERNAL_API_SECRET is attached here: these
 * FastAPI routes intentionally have no auth dependency, the same way
 * /api/v1/attempts/start and /api/v1/invitations/validate/{token} don't.
 *
 * Keeping this separate from /api/candidate/[...path] (attempt endpoints)
 * keeps each proxy's whitelist narrow and easy to audit.
 */

import { NextRequest, NextResponse } from "next/server";
import axios, { AxiosError } from "axios";
import { requireServerEnv } from "@/lib/env";
import { getForwardedClientIp } from "@/lib/server/clientIp";

const DEFAULT_TIMEOUT = 15_000;
const MAX_BODY_BYTES = 64 * 1024;

function isAllowedPublicLinkPath(apiPath: string, method: string): boolean {
  if (/^\/api\/v1\/public-links\/resolve\/[^/]+$/.test(apiPath)) {
    return method === "GET";
  }
  if (/^\/api\/v1\/public-links\/[^/]+\/register$/.test(apiPath)) {
    return method === "POST";
  }
  if (/^\/api\/v1\/(?:cmp|cms)\/public\/blog\/[^/]+\/clap$/.test(apiPath)) {
    return method === "POST";
  }
  return false;
}

async function proxyPublicRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  try {
    const { path } = await params;
    const apiPath = "/" + path.join("/");

    if (!isAllowedPublicLinkPath(apiPath, req.method)) {
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

    const clientIp = getForwardedClientIp(req);
    if (clientIp) forwardedHeaders["X-Talvyn-Client-IP"] = clientIp;

    // Forward the browser's cookies upstream (FastAPI reads rp_device_id
    // from this to recognize a returning device — see public_links.py).
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) forwardedHeaders["Cookie"] = cookieHeader;

    let body: string | undefined;
    if (!["GET", "HEAD"].includes(req.method)) {
      body = await req.text();
      if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large." } },
          { status: 413 }
        );
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

    const res = NextResponse.json(parsedBody, { status: upstreamRes.status });

    // Forward FastAPI's Set-Cookie (the rp_device_id device-tracking cookie)
    // to the actual browser — axios returns multi-value headers as an array.
    const setCookie = upstreamRes.headers["set-cookie"];
    if (setCookie) {
      for (const cookie of Array.isArray(setCookie) ? setCookie : [setCookie]) {
        res.headers.append("Set-Cookie", cookie);
      }
    }

    return res;
  } catch (err: unknown) {
    console.error("[api/public] error:", err);

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
      { error: { code: "PROXY_ERROR", message: "Request failed." } },
      { status: 500 }
    );
  }
}

export const GET = proxyPublicRequest;
export const POST = proxyPublicRequest;

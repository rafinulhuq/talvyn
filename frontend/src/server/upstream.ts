/**
 * Shared plumbing for the routes that forward browser requests to FastAPI
 * (/api/proxy, /api/candidate, /api/public).
 *
 * axios, not fetch: Node's fetch (undici) has a hidden 300s headersTimeout
 * that kills long generation calls before our own timeout fires.
 */
import axios, { AxiosError, type AxiosResponse } from "axios";
import { NextResponse, type NextRequest } from "next/server";
import { backendBaseUrl } from "@/server/internal-api";

export type RouteContext = { params: Promise<{ path: string[] }> };

export const errorJson = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

/**
 * Join catch-all segments into an absolute backend path — or null if any
 * segment could change the path after normalization. Without this,
 * /api/proxy/x/%2e%2e/api/v1/internal/... passes a prefix denylist and is then
 * collapsed by URL resolution into the forbidden path.
 */
export function safeApiPath(segments: string[]): string | null {
  if (segments.length === 0) return null;
  for (const s of segments) {
    if (s === "" || s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("%")) return null;
  }
  const path = `/${segments.join("/")}`;
  // Belt and braces: the normalized path must equal the joined path.
  return new URL(path, "http://upstream.invalid").pathname === path ? path : null;
}

/** Read a request body with a size cap. Returns a 413 response when exceeded. */
export async function readBody(req: NextRequest, maxBytes: number): Promise<{ body: string } | { error: NextResponse }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { error: errorJson(413, "PAYLOAD_TOO_LARGE", "Request body too large.") };
  const body = await req.text();
  if (Buffer.byteLength(body, "utf-8") > maxBytes) return { error: errorJson(413, "PAYLOAD_TOO_LARGE", "Request body too large.") };
  return { body };
}

/**
 * FastAPI answers a collection route without its trailing slash ("/invitations")
 * with a 307 to "/invitations/". Next strips trailing slashes before this layer,
 * so follow exactly that one redirect: same path plus "/", nothing else.
 * Any other redirect is never followed (it could point anywhere).
 */
export function slashRedirectTarget(location: unknown, apiPath: string): string | null {
  if (typeof location !== "string" || !location) return null;
  try {
    const target = new URL(location, "http://upstream.invalid");
    return target.pathname === `${apiPath}/` ? target.pathname : null;
  } catch {
    return null;
  }
}

export async function forward(
  req: NextRequest,
  apiPath: string,
  opts: { headers: Record<string, string>; body?: string; timeoutMs: number; binary?: boolean },
): Promise<AxiosResponse<string | ArrayBuffer>> {
  const send = (path: string) =>
    axios.request<string | ArrayBuffer>({
      url: `${backendBaseUrl()}${path}${req.nextUrl.search}`,
      method: req.method,
      headers: opts.headers,
      data: opts.body,
      timeout: opts.timeoutMs,
      responseType: opts.binary ? "arraybuffer" : "text",
      validateStatus: () => true,
      decompress: false,
      maxRedirects: 0,
    });
  const res = await send(apiPath);
  if (res.status === 307 || res.status === 308) {
    const retry = slashRedirectTarget(res.headers["location"], apiPath);
    if (retry) return send(retry);
  }
  return res;
}

/** Re-emit an upstream text response as JSON with the same status. */
export function jsonFromUpstream(res: AxiosResponse<string | ArrayBuffer>): NextResponse {
  // Next's Response constructor throws on a 204/205 with a body; callers expect {} anyway.
  if (res.status === 204 || res.status === 205) return NextResponse.json({}, { status: 200 });
  // A redirect we didn't follow must not reach the browser (it would chase an internal URL).
  if (res.status >= 300 && res.status < 400) {
    console.error(`[upstream] unexpected ${res.status} redirect to ${String(res.headers["location"] ?? "")}`);
    return errorJson(502, "UPSTREAM_REDIRECT", "The Talvyn service returned an unexpected response. Try again.");
  }
  const text = typeof res.data === "string" ? res.data : Buffer.from(res.data).toString("utf-8");
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return NextResponse.json(parsed, { status: res.status });
}

export function upstreamFailure(scope: string, err: unknown): NextResponse {
  if (err instanceof AxiosError && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT")) {
    return errorJson(504, "TIMEOUT", "The server took too long to respond. Try again.");
  }
  console.error(`[${scope}] upstream request failed: ${(err as Error).message}`);
  return errorJson(502, "UPSTREAM_UNAVAILABLE", "The service is unavailable. Try again shortly.");
}

export function contentTypeHeader(req: NextRequest): Record<string, string> {
  const ct = req.headers.get("content-type");
  return ct ? { "Content-Type": ct } : {};
}

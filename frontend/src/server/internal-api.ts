/**
 * Server-only client for FastAPI. Every call carries X-Internal-Token (proves
 * the request came through this Next.js server) and, when there is a signed-in
 * user, X-Actor-Id/X-Uploader-Id/X-Inviter-Id — the backend re-resolves that
 * user and re-checks their role on every request.
 *
 * NEVER import from client components: the secret must not reach the browser.
 */
import { requireServerEnv } from "@/lib/env";

export function backendBaseUrl(): string {
  return requireServerEnv("FASTAPI_INTERNAL_URL", "http://localhost:8000");
}

export function internalHeaders(actorId?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "X-Internal-Token": requireServerEnv("INTERNAL_API_SECRET") };
  if (actorId) {
    headers["X-Actor-Id"] = actorId;
    headers["X-Uploader-Id"] = actorId;
    headers["X-Inviter-Id"] = actorId;
  }
  return headers;
}

export type BackendResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; data: unknown };

export type BackendFetchOptions = Omit<RequestInit, "headers"> & {
  actorId?: string | null;
  headers?: Record<string, string>;
  /** ISR seconds, or false to cache until deploy; omit to inherit the segment default. */
  revalidate?: number | false;
  tags?: string[];
};

/**
 * Fetch JSON from FastAPI. Uses native fetch so Next's caching/dedup applies.
 * Never throws for HTTP or network errors: status 0 means the backend was unreachable.
 */
export async function backendFetch<T>(
  path: string,
  { actorId, headers, revalidate, tags, ...init }: BackendFetchOptions = {},
): Promise<BackendResult<T>> {
  try {
    const res = await fetch(`${backendBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...internalHeaders(actorId),
        ...headers,
      },
      next: revalidate === undefined && !tags ? undefined : { revalidate, tags },
    });
    const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    return res.ok ? { ok: true, status: res.status, data: data as T } : { ok: false, status: res.status, data };
  } catch (err) {
    // Message only: transport errors can embed request bodies.
    console.error(`[backend] ${init.method ?? "GET"} ${path} unreachable: ${(err as Error).message}`);
    return { ok: false, status: 0, data: null };
  }
}

type EmailDispatch = { sent: number; failed: number };

/**
 * POST to /api/v1/internal/emails/<kind>. True only if every message was sent.
 * Internal email routes are reachable ONLY through this helper — the browser
 * proxy refuses /api/v1/internal/* (see app/api/proxy).
 */
export async function sendInternalEmail(kind: string, body: Record<string, unknown>): Promise<boolean> {
  const result = await backendFetch<EmailDispatch>(`/api/v1/internal/emails/${kind}`, {
    method: "POST",
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return result.ok && result.data.sent >= 1 && result.data.failed === 0;
}

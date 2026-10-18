/**
 * serverFetch — server-component data-fetching helper.
 *
 * Uses native fetch() so Next.js ISR (revalidate) and within-request
 * deduplication actually work.  The axios-based apiClient bypasses
 * Next.js's fetch cache entirely, making `export const revalidate = N`
 * a complete no-op for every page that uses it.
 *
 * ⚠️  SERVER-ONLY.  Never import this in "use client" components.
 *     FASTAPI_INTERNAL_URL and INTERNAL_API_SECRET must never reach the browser.
 *
 * Returns T on success, null on any HTTP error or network failure —
 * the same "success or null" contract as apiClient.get().
 *
 * Usage:
 *   const data = await serverFetch<MyType>("/api/v1/...", { revalidate: 30 });
 *
 * Cache options (Next.js extensions to fetch):
 *   revalidate: 30   → ISR — revalidate every 30 s
 *   revalidate: 0    → always fresh (no caching, dynamic rendering)
 *   revalidate: false → static — cache forever until next deploy
 *   tags: ["jds"]    → on-demand revalidation via revalidateTag("jds")
 *   omit             → inherit the route-segment default (export const revalidate)
 */

import { requireServerEnv } from "@/lib/env";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export interface ServerFetchOptions extends Omit<RequestInit, "next"> {
  /**
   * Next.js ISR revalidation interval in seconds.
   * number → revalidate every N seconds
   * false  → cache forever (static)
   * 0      → always fetch fresh
   * Omit to inherit the segment-level `export const revalidate` value.
   */
  revalidate?: number | false;
  /** Cache tags for on-demand revalidation via revalidateTag(). */
  tags?: string[];
}

async function internalHeaders(initHeaders: RequestInit["headers"]): Promise<Record<string, string>> {
  const internalApiSecret = requireServerEnv("INTERNAL_API_SECRET");
  const session = await getServerSession(authOptions);
  const actorId = session?.user?.id;

  return {
    "Content-Type": "application/json",
    "X-Internal-Token": internalApiSecret,
    ...(actorId
      ? {
          "X-Actor-Id": actorId,
          "X-Uploader-Id": actorId,
          "X-Inviter-Id": actorId,
        }
      : {}),
    ...((initHeaders as Record<string, string>) ?? {}),
  };
}

export async function serverFetch<T>(
  path: string,
  { revalidate, tags, ...init }: ServerFetchOptions = {}
): Promise<T | null> {
  const fastapiInternalUrl = requireServerEnv("FASTAPI_INTERNAL_URL", "http://localhost:8000");
  const url = `${fastapiInternalUrl}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      headers: await internalHeaders(init.headers),
      // `next` is Next.js's extension to the native fetch API.
      // Passing undefined values is safe — Next.js ignores them.
      next: { revalidate, tags },
    });

    if (!res.ok) {
      console.error(`[serverFetch] ${path} → HTTP ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.error(`[serverFetch] ${path} failed:`, err);
    return null;
  }
}

/**
 * serverFetchRaw — like serverFetch, but returns the parsed body regardless
 * of HTTP status. Use this for endpoints that intentionally return a non-2xx
 * status as part of their payload semantics (e.g. /health/ready returns 503
 * when degraded, with the actual check details still in the JSON body —
 * serverFetch's "non-2xx → null" contract would silently discard exactly the
 * data we need in that case).
 */
export async function serverFetchRaw<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; data: T | null }> {
  const fastapiInternalUrl = requireServerEnv("FASTAPI_INTERNAL_URL", "http://localhost:8000");
  const url = `${fastapiInternalUrl}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      headers: await internalHeaders(init.headers),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, data };
  } catch (err) {
    console.error(`[serverFetchRaw] ${path} failed:`, err);
    return { status: 0, data: null };
  }
}

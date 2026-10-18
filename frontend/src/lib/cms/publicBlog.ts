import { requireServerEnv } from "@/lib/env";
import { getDefaultBlogList, getDefaultBlogPost } from "@/lib/cms/defaultBlogPosts";
import type {
  PublicBlogListResponse,
  PublicBlogPost,
  PublicBlogPostSummary,
} from "@/types/cms";

export const BLOG_PAGE_SIZE = 9;

export async function getPublicBlogList(
  page = 1,
  tag?: string,
  limit: number = BLOG_PAGE_SIZE
): Promise<PublicBlogListResponse> {
  try {
    const fastapiInternalUrl = requireServerEnv("FASTAPI_INTERNAL_URL", "http://localhost:8000");
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String((Math.max(page, 1) - 1) * limit),
    });
    if (tag) params.set("tag", tag);
    const res = await fetch(`${fastapiInternalUrl}/api/v1/cmp/public/blog?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return getDefaultBlogList(page, tag, limit);
    }
    const data = (await res.json()) as PublicBlogListResponse;
    if (data.items && data.items.length > 0) {
      return data;
    }
    return getDefaultBlogList(page, tag, limit);
  } catch {
    return getDefaultBlogList(page, tag, limit);
  }
}

/**
 * Every published post summary, for sitemap/RSS generation. Pages through
 * the public list endpoint (server-capped at 24 per request) with a hard
 * ceiling so a runaway corpus can't stall the sitemap render.
 */
export async function getAllPublishedPostSummaries(
  maxPosts = 500
): Promise<PublicBlogPostSummary[]> {
  const pageSize = 24; // backend Query(le=24) cap
  const posts: PublicBlogPostSummary[] = [];
  for (let offset = 0; posts.length < maxPosts; offset += pageSize) {
    const page = Math.floor(offset / pageSize) + 1;
    const batch = await getPublicBlogList(page, undefined, pageSize);
    posts.push(...batch.items);
    if (batch.items.length < pageSize || posts.length >= batch.total) break;
  }
  return posts.slice(0, maxPosts);
}

export async function getPublicBlogPost(slug: string): Promise<PublicBlogPost | null> {
  try {
    const fastapiInternalUrl = requireServerEnv("FASTAPI_INTERNAL_URL", "http://localhost:8000");
    const res = await fetch(
      `${fastapiInternalUrl}/api/v1/cmp/public/blog/${encodeURIComponent(slug)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json()) as PublicBlogPost;
      if (data && data.slug) return data;
    }
    return getDefaultBlogPost(slug);
  } catch {
    return getDefaultBlogPost(slug);
  }
}

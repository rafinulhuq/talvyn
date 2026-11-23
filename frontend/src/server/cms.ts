import "server-only";
import { mergeCopy } from "@/lib/cms/candidate-copy";
import { DEFAULT_HOME, DEFAULT_SITE, type HomeContent, type SiteContent } from "@/lib/cms/site-content";
import { backendBaseUrl } from "@/server/internal-api";
import type { PublicPost, PublicPostList } from "@/types/blog";

/** Public site content. Never throws: falls back to the built-in defaults if the backend is down. */
export async function siteContent(): Promise<{ site: SiteContent; home: HomeContent }> {
  try {
    const res = await fetch(`${backendBaseUrl()}/api/v1/cmp/public/content`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { site: DEFAULT_SITE, home: DEFAULT_HOME };
    const data = (await res.json()) as { site?: unknown; home?: unknown };
    return { site: mergeCopy(DEFAULT_SITE, data.site), home: mergeCopy(DEFAULT_HOME, data.home) };
  } catch {
    return { site: DEFAULT_SITE, home: DEFAULT_HOME };
  }
}

export async function publicPosts({ limit = 9, offset = 0, tag }: { limit?: number; offset?: number; tag?: string } = {}): Promise<PublicPostList> {
  const qs = new URLSearchParams({ limit: String(Math.min(24, Math.max(1, limit))), offset: String(Math.max(0, offset)) });
  if (tag) qs.set("tag", tag.slice(0, 40));
  try {
    const res = await fetch(`${backendBaseUrl()}/api/v1/cmp/public/blog?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as PublicPostList) : { items: [], total: 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

/** null = not found (or not published). Throws only on a backend outage, so the page can show an error instead of a false 404. */
export async function publicPost(slug: string): Promise<PublicPost | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,254}$/i.test(slug)) return null;
  const res = await fetch(`${backendBaseUrl()}/api/v1/cmp/public/blog/${encodeURIComponent(slug)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blog post ${res.status}`);
  return (await res.json()) as PublicPost;
}

/** Every published post, newest first, up to `max` (the API pages by 24). */
export async function allPublicPosts(max = 500) {
  const out: PublicPostList["items"] = [];
  for (let offset = 0; offset < max; offset += 24) {
    const page = await publicPosts({ limit: 24, offset });
    out.push(...page.items);
    if (page.items.length < 24 || out.length >= page.total) break;
  }
  return out.slice(0, max);
}

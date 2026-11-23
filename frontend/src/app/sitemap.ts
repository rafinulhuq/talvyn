import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { allPublicPosts } from "@/server/cms";

export const dynamic = "force-dynamic";

/** Public pages and published posts only. Whether crawlers may index is robots.ts's job. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const posts = await allPublicPosts();
  const newest = posts.map((p) => p.published_at).filter((d): d is string => !!d).sort().at(-1);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8, ...(newest ? { lastModified: new Date(newest) } : {}) },
    ...posts.map((p) => ({
      url: `${base}/blog/${encodeURIComponent(p.slug)}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      ...(p.published_at ? { lastModified: new Date(p.published_at) } : {}),
    })),
  ];
}

/**
 * sitemap.xml — public pages + published blog posts.
 *
 * Whether crawlers may index anything at all is governed by robots.ts /
 * the CMS "Allow indexing" toggle; the sitemap itself is safe to serve
 * regardless (it only lists already-public URLs, never candidate routes).
 */

import type { MetadataRoute } from "next";
import { getAllPublishedPostSummaries } from "@/lib/cms/publicBlog";
import { getSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const posts = await getAllPublishedPostSummaries();

  const newestPost = posts
    .map((post) => post.published_at)
    .filter((iso): iso is string => Boolean(iso))
    .sort()
    .at(-1);

  return [
    {
      url: `${base}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/blog`,
      changeFrequency: "daily",
      priority: 0.8,
      ...(newestPost ? { lastModified: new Date(newestPost) } : {}),
    },
    ...posts.map((post) => ({
      url: `${base}/blog/${encodeURIComponent(post.slug)}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      ...(post.published_at ? { lastModified: new Date(post.published_at) } : {}),
    })),
  ];
}

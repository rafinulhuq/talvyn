/**
 * RSS 2.0 feed for the blog — /blog/feed.xml
 *
 * Built from published posts only (same public endpoint the /blog pages
 * use). Feed readers poll this, so allow a short shared cache.
 */

import { getAllPublishedPostSummaries } from "@/lib/cms/publicBlog";
import { getPublicCmsContent } from "@/lib/cms/publicContent";
import { getSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET(): Promise<Response> {
  const base = getSiteUrl();
  const [cms, posts] = await Promise.all([
    getPublicCmsContent(),
    getAllPublishedPostSummaries(50),
  ]);
  const brand = cms.site.brand.name;

  const items = posts
    .map((post) => {
      const url = `${base}/blog/${encodeURIComponent(post.slug)}`;
      const pubDate = post.published_at
        ? `\n      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>`
        : "";
      const description = post.excerpt
        ? `\n      <description>${xmlEscape(post.excerpt)}</description>`
        : "";
      const author = post.author_name
        ? `\n      <dc:creator>${xmlEscape(post.author_name)}</dc:creator>`
        : "";
      const categories = post.tags
        .map((tag) => `\n      <category>${xmlEscape(tag)}</category>`)
        .join("");
      return `    <item>
      <title>${xmlEscape(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>${pubDate}${description}${author}${categories}
    </item>`;
    })
    .join("\n");

  const newest = posts
    .map((post) => post.published_at)
    .filter((iso): iso is string => Boolean(iso))
    .sort()
    .at(-1);

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(brand)} Blog</title>
    <link>${base}/blog</link>
    <description>${xmlEscape(`Articles and updates from ${brand}.`)}</description>
    <language>en</language>${newest ? `\n    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : ""}
    <atom:link href="${base}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(feed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

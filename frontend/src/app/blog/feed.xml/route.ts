import { getSiteUrl } from "@/lib/site-url";
import { allPublicPosts, siteContent } from "@/server/cms";

export const dynamic = "force-dynamic";

const esc = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

/** RSS 2.0 feed of the newest 50 published posts. */
export async function GET(): Promise<Response> {
  const base = getSiteUrl();
  const [{ site }, posts] = await Promise.all([siteContent(), allPublicPosts(50)]);
  const items = posts
    .map((p) => {
      const url = `${base}/blog/${encodeURIComponent(p.slug)}`;
      return [
        "    <item>",
        `      <title>${esc(p.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        p.published_at ? `      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : "",
        p.excerpt ? `      <description>${esc(p.excerpt)}</description>` : "",
        p.author_name ? `      <dc:creator>${esc(p.author_name)}</dc:creator>` : "",
        ...p.tags.map((t) => `      <category>${esc(t)}</category>`),
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const newest = posts.map((p) => p.published_at).filter((d): d is string => !!d).sort().at(-1);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${esc(site.brand.name)} Blog</title>
    <link>${base}/blog</link>
    <description>${esc(`Writing from ${site.brand.name}.`)}</description>
    <language>en</language>${newest ? `\n    <lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : ""}
    <atom:link href="${base}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

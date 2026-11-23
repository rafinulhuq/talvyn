import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { siteContent } from "@/server/cms";

export const dynamic = "force-dynamic";

/**
 * Follows the "Allow indexing" switch in Website content. While it's off the
 * whole site is disallowed. Candidate and app routes are never crawlable.
 * (On the app host, src/proxy.ts answers robots.txt with a blanket disallow.)
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { site } = await siteContent();
  if (!site.metadata.robotsIndex) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/login", "/signup", "/api/", "/test/", "/tests/", "/exam/", "/apply/"] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}

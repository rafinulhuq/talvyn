/**
 * robots.txt — driven by the CMS "Allow indexing" toggle (Site Content →
 * SEO Metadata). While indexing is off the whole site is disallowed;
 * once on, only the genuinely public surfaces are crawlable. Candidate
 * routes stay blocked either way (defense in depth on top of their
 * noindex meta and nginx headers).
 */

import type { MetadataRoute } from "next";
import { getPublicCmsContent } from "@/lib/cms/publicContent";
import { getSiteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = getSiteUrl();
  const cms = await getPublicCmsContent();

  if (!cms.site.metadata.robotsIndex) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/login",
        "/api/",
        "/test/",
        "/tests/",
        "/exam/",
        "/apply/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

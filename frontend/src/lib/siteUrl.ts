/**
 * Canonical origins for absolute URLs.
 *
 * Two hostnames, two jobs:
 *   NEXT_PUBLIC_SITE_URL → the PUBLIC marketing site (www.talvyn.com).
 *     Used for sitemap.xml, robots.txt, blog canonical links and the RSS
 *     feed — everything a crawler should attribute to the public site.
 *   NEXT_PUBLIC_APP_URL  → the APPLICATION origin (app.talvyn.com).
 *     Used for auth redirects and admin "copy link" actions.
 *
 * These were one variable before the www/app split. Keeping sitemap and
 * canonical URLs on NEXT_PUBLIC_APP_URL after the split would advertise
 * public blog posts under the app hostname while they are actually served
 * from www — split indexing, and hard to unwind once crawled.
 *
 * Both are `NEXT_PUBLIC_*` and therefore inlined at BUILD time (verified:
 * the compiled server chunk contains the literal string, not a
 * process.env lookup). They must be supplied as Docker build args, not only
 * as runtime env — see Dockerfile.prod.
 */

function normalize(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/**
 * Public marketing origin — sitemap, robots, canonical links, RSS.
 * Falls back to NEXT_PUBLIC_APP_URL so a deployment that has not yet split
 * its hostnames keeps working unchanged.
 */
export function getSiteUrl(): string {
  return normalize(
    process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000"
  );
}

/** Application origin — auth redirects, invitation/copy-link URLs. */
export function getAppUrl(): string {
  return normalize(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
}

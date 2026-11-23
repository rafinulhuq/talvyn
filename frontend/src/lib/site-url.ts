/**
 * Canonical origins. Both are NEXT_PUBLIC_* → inlined at BUILD time, so they
 * must be Docker build args (see Dockerfile.prod).
 *   site (www) → sitemap, robots, blog canonical links, RSS
 *   app        → auth redirects, invitation / copy-link URLs
 */
const strip = (raw: string) => raw.replace(/\/+$/, "");

export function getSiteUrl(): string {
  return strip(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
}

export function getAppUrl(): string {
  return strip(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
}

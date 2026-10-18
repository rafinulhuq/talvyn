/**
 * Public hostnames — the www / app split.
 *
 * Production serves two hostnames from this ONE Next.js container:
 *   www.talvyn.com  → marketing landing + blog
 *   app.talvyn.com  → dashboard, auth, candidate assessment routes
 *
 * Both are Cloudflare Tunnel public hostnames pointing at the same local
 * port (see the `cloudflared` service in docker-compose.prod.yml), so the
 * separation has to happen in middleware rather than in a proxy — there is
 * no Nginx in the production stack.
 *
 * The hosts are DERIVED from the same env vars that already define the two
 * origins rather than hardcoded, so dev, CI and Playwright (where both vars
 * point at localhost) resolve to a single host and the split disables
 * itself — see HOST_SPLIT_ENABLED.
 *
 * NOTE: these are `NEXT_PUBLIC_*`, so they are inlined at BUILD time, not
 * read at runtime. They must be passed as Docker build args — Dockerfile.prod
 * and docker-compose.prod.yml do this. Changing them requires a rebuild.
 */

function hostnameOf(value: string | undefined, fallback: string): string {
  try {
    return new URL(value ?? fallback).hostname;
  } catch {
    return new URL(fallback).hostname;
  }
}

const LOCAL_FALLBACK = "http://localhost:3000";

/** Hostname serving the public marketing site (e.g. www.talvyn.com). */
export const SITE_HOST = hostnameOf(process.env.NEXT_PUBLIC_SITE_URL, LOCAL_FALLBACK);

/** Hostname serving the application (e.g. app.talvyn.com). */
export const APP_HOST = hostnameOf(process.env.NEXT_PUBLIC_APP_URL, LOCAL_FALLBACK);

/**
 * Bare apex, derived by stripping a leading "www." from the site host.
 * `talvyn.com` → redirected to `www.talvyn.com` so only one hostname
 * is ever indexed. Empty when the site host has no "www." prefix, in which
 * case no apex redirect is registered.
 */
export const APEX_HOST = SITE_HOST.startsWith("www.") ? SITE_HOST.slice(4) : "";

/**
 * The split only applies when the two origins genuinely differ. In dev and
 * in CI both env vars point at localhost, so every host check below
 * short-circuits and middleware behaves exactly as it did before.
 */
export const HOST_SPLIT_ENABLED = SITE_HOST !== APP_HOST;

/** Routes that only ever belong on the app host. */
const APP_ONLY_PREFIXES = [
  "/dashboard",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/test",
  "/tests",
  "/exam",
  "/apply",
];

/** Routes that only ever belong on the site host. */
const SITE_ONLY_PREFIXES = ["/blog"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isAppOnlyPath(pathname: string): boolean {
  return matchesPrefix(pathname, APP_ONLY_PREFIXES);
}

export function isSiteOnlyPath(pathname: string): boolean {
  return pathname === "/" || matchesPrefix(pathname, SITE_ONLY_PREFIXES);
}

/**
 * Paths that must NEVER be host-redirected.
 *
 * `/api/*` in particular: the landing page's ClapButton and the shared
 * WebVitalsReporter both POST to /api from public pages. Bouncing those to
 * the other hostname would turn same-origin requests into cross-origin ones
 * and require CORS. Keeping /api same-origin on BOTH hosts avoids that
 * entirely — the routes are cheap and already do their own auth checks.
 */
export function isHostNeutralPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg"
  );
}

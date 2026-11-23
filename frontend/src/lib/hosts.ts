/**
 * www / app host split. Both Cloudflare Tunnel hostnames point at this one
 * container, so routing by hostname happens in src/proxy.ts. Hosts are derived
 * from the origin env vars (build-time inlined); in dev/CI both are localhost
 * and the split disables itself.
 */
const LOCAL = "http://localhost:3000";

function hostnameOf(value: string | undefined): string {
  try {
    return new URL(value ?? LOCAL).hostname;
  } catch {
    return new URL(LOCAL).hostname;
  }
}

export const SITE_HOST = hostnameOf(process.env.NEXT_PUBLIC_SITE_URL);
export const APP_HOST = hostnameOf(process.env.NEXT_PUBLIC_APP_URL);
/** `talvyn.com` when the site host is `www.talvyn.com`; empty otherwise. */
export const APEX_HOST = SITE_HOST.startsWith("www.") ? SITE_HOST.slice(4) : "";
export const HOST_SPLIT_ENABLED = SITE_HOST !== APP_HOST;

const APP_ONLY = ["/dashboard", "/login", "/signup", "/forgot-password", "/reset-password", "/test", "/tests", "/exam", "/apply"];
const SITE_ONLY = ["/blog"];

const matches = (pathname: string, prefixes: readonly string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export const isAppOnlyPath = (pathname: string) => matches(pathname, APP_ONLY);
export const isSiteOnlyPath = (pathname: string) => pathname === "/" || matches(pathname, SITE_ONLY);

/**
 * Never host-redirected. /api must stay same-origin on BOTH hosts (public
 * pages POST to /api for claps and web vitals); redirecting would make those
 * cross-origin and require CORS.
 */
export const isHostNeutralPath = (pathname: string) =>
  pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/favicon.ico" || pathname === "/icon.svg";

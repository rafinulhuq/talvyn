/**
 * Next.js Edge Middleware — Route protection + magic-link redemption.
 *
 * Rules:
 * - /dashboard/* → requires active NextAuth session → redirect to /login
 * - /login        → if already authenticated → redirect to /dashboard
 * - /test/*, /tests/*, /exam/* → public candidate magic-link routes. A URL
 *   that still carries the raw token in its path (the emailed link) is
 *   REDEEMED here: the token moves into an httpOnly cookie and the request
 *   is redirected to the tokenless /tests/session or /exam/session route,
 *   so the token never persists in the address bar, browser history,
 *   referrers, or anything client JS can read (A8-4).
 * - /apply/*      → public (public assessment link registration, no session required)
 * - /api/auth/*   → NextAuth internals, always pass through
 * - /api/proxy/*  → not gated here at all — proxyRequest() does its own
 *                   getToken() check. This route is hit on every autosave
 *                   (10s), heartbeat (30s) and status poll (15s), so
 *                   verifying the JWT twice per request is wasted CPU.
 * - /api/public/* → public assessment-link endpoints, no session required
 *
 * Ahead of all of that, requests are routed by HOSTNAME (www vs app) — see
 * hostRedirect() below and @/lib/hosts.
 */

import { getToken } from "next-auth/jwt";
import { currentSessionUser } from "@/lib/auth/sessionState";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ATTEMPT_TOKEN_COOKIE,
  ATTEMPT_TOKEN_MAX_AGE_SECONDS,
  redeemTokenPath,
} from "@/lib/candidateSession";
import {
  APEX_HOST,
  APP_HOST,
  HOST_SPLIT_ENABLED,
  SITE_HOST,
  isAppOnlyPath,
  isHostNeutralPath,
  isSiteOnlyPath,
} from "@/lib/hosts";

const PROTECTED_PREFIX = "/dashboard";

// Role-gated dashboard areas. A signed-in user whose role is below the
// required minimum is bounced back to /dashboard. This is defense-in-depth for
// the UX — the authoritative boundary is the backend (require_min_role) and the
// Super-Admin-only Next.js API routes. Rank inlined to keep the edge bundle
// free of app imports. Order does not matter (prefixes are disjoint).
const ROLE_RANK: Record<string, number> = { USER: 1, ADMIN: 2, SUPER_ADMIN: 3 };
const ROUTE_MIN_ROLE: { prefix: string; minRole: "ADMIN" | "SUPER_ADMIN" }[] = [
  { prefix: "/dashboard/users", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/cmp", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/cms", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/highgarden", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/trash", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/settings", minRole: "ADMIN" },
  { prefix: "/dashboard/templates", minRole: "ADMIN" },
  { prefix: "/dashboard/companies", minRole: "ADMIN" },
];
const PUBLIC_PREFIXES = [
  "/test",
  "/tests",
  "/exam",
  "/apply",
  "/api/auth",
  "/api/proxy",
  "/api/candidate",
  "/api/public",
  "/_next",
  "/favicon",
];

/**
 * Route a request to the hostname that owns it.
 *
 * Both public hostnames resolve to this same container (one Cloudflare
 * Tunnel, two public hostnames, one local port), so without this every page
 * would answer on both — duplicate content for crawlers and an app that
 * appears to live at two addresses.
 *
 * Returns null when no redirect applies, including whenever the split is
 * disabled (dev / CI / Playwright, where both origins are localhost).
 *
 * 308 rather than 302: permanent and method-preserving, so crawlers move
 * link equity to the canonical host and a POST is never silently downgraded.
 */
function hostRedirect(request: NextRequest): NextResponse | null {
  if (!HOST_SPLIT_ENABLED) return null;

  const { pathname, search } = request.nextUrl;
  if (isHostNeutralPath(pathname)) return null;

  const host = request.headers.get("host")?.split(":")[0] ?? "";

  const to = (targetHost: string) =>
    NextResponse.redirect(`https://${targetHost}${pathname}${search}`, 308);

  // Apex is never served directly — send it straight to the hostname that
  // owns the path. Routing it unconditionally to the site host would make
  // talvyn.com/dashboard take two hops (apex → www → app).
  if (APEX_HOST && host === APEX_HOST) {
    return to(isAppOnlyPath(pathname) ? APP_HOST : SITE_HOST);
  }

  if (host === SITE_HOST && isAppOnlyPath(pathname)) return to(APP_HOST);
  if (host === APP_HOST && isSiteOnlyPath(pathname)) return to(SITE_HOST);

  return null;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── Route by hostname (www vs app) before anything else ──────
  const redirectToHost = hostRedirect(request);
  if (redirectToHost) return redirectToHost;

  // ── Keep the app hostname out of search results ──────────────
  // robots.ts is a single route serving both hostnames and is driven by the
  // CMS "Allow indexing" toggle for the public site. The app host must be
  // disallowed unconditionally, so it is answered here instead.
  if (
    HOST_SPLIT_ENABLED &&
    pathname === "/robots.txt" &&
    (request.headers.get("host")?.split(":")[0] ?? "") === APP_HOST
  ) {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // ── Redeem magic-link tokens out of candidate URLs ───────────
  const redemption = redeemTokenPath(pathname);
  if (redemption) {
    const url = request.nextUrl.clone();
    url.pathname = redemption.redirectTo;
    const response = NextResponse.redirect(url);
    response.cookies.set(ATTEMPT_TOKEN_COOKIE, redemption.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: ATTEMPT_TOKEN_MAX_AGE_SECONDS,
    });
    return response;
  }

  // ── Always allow public paths ────────────────────────────────
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (
    !pathname.startsWith(PROTECTED_PREFIX) &&
    pathname !== "/login" &&
    pathname !== "/signup" &&
    pathname !== "/forgot-password" &&
    pathname !== "/reset-password"
  ) {
    return NextResponse.next();
  }

  // ── Verify session token ─────────────────────────────────────
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const currentUser = token ? await currentSessionUser(token) : null;
  const isAuthenticated = Boolean(currentUser);

  // ── Protect admin routes ─────────────────────────────────────
  if (pathname.startsWith(PROTECTED_PREFIX)) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Role-gate the restricted dashboard areas.
    const role = currentUser?.role ?? "USER";
    const rule = ROUTE_MIN_ROLE.find((r) => pathname.startsWith(r.prefix));
    if (rule && (ROLE_RANK[role] ?? 0) < ROLE_RANK[rule.minRole]) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // ── Redirect authenticated users away from auth pages ────────
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  /*
   * Match all paths except:
   * - _next/static (static files)
   * - _next/image (image optimization)
   * - favicon.ico
   * - public folder files
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

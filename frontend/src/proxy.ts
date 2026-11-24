/**
 * Request gate (Next 16 `proxy`, Node runtime). In order:
 *   1. Route by hostname: www (landing, blog) vs app (everything else).
 *   2. Serve a disallow-all robots.txt on the app host.
 *   3. Redeem candidate magic-link tokens into an httpOnly cookie.
 *   4. Gate /dashboard behind a live session + per-area minimum role.
 *   5. Bounce signed-in users away from the auth pages.
 *   6. Attach a per-request nonce + Content-Security-Policy to pages (src/lib/csp.ts).
 *
 * /api/* is NOT gated here — every route handler does its own auth. The
 * /api/proxy hot path (autosave, heartbeat, polling) would otherwise verify
 * the session twice per request.
 *
 * The role gates are UX only. The authority is the backend's require_min_role
 * and the server-side checks in each route handler.
 */
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { ATTEMPT_TOKEN_COOKIE, ATTEMPT_TOKEN_MAX_AGE_SECONDS, redeemTokenPath } from "@/lib/candidate-session";
import {
  APEX_HOST,
  APP_HOST,
  HOST_SPLIT_ENABLED,
  SITE_HOST,
  isAppOnlyPath,
  isHostNeutralPath,
  isSiteOnlyPath,
} from "@/lib/hosts";
import { buildCsp, dsnOrigin, newNonce } from "@/lib/csp";
import { roleAtLeast, type RankedRole } from "@/lib/roles";
import { currentSessionUser } from "@/server/auth/session";

const AUTH_PAGES = new Set(["/login", "/signup", "/forgot-password", "/reset-password"]);

const AREA_MIN_ROLE: { prefix: string; minRole: RankedRole }[] = [
  { prefix: "/dashboard/users", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/cmp", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/cms", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/highgarden", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/trash", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/settings", minRole: "ADMIN" },
  { prefix: "/dashboard/templates", minRole: "ADMIN" },
  { prefix: "/dashboard/companies", minRole: "ADMIN" },
];

const hostOf = (req: NextRequest) => req.headers.get("host")?.split(":")[0] ?? "";

/** 308: permanent + method-preserving, so crawlers consolidate on one host and POSTs aren't downgraded. */
function hostRedirect(req: NextRequest): NextResponse | null {
  if (!HOST_SPLIT_ENABLED) return null;
  const { pathname, search } = req.nextUrl;
  if (isHostNeutralPath(pathname)) return null;

  const host = hostOf(req);
  const to = (target: string) => NextResponse.redirect(`https://${target}${pathname}${search}`, 308);

  // Apex goes straight to the owning host (one hop, not apex → www → app).
  if (APEX_HOST && host === APEX_HOST) return to(isAppOnlyPath(pathname) ? APP_HOST : SITE_HOST);
  if (host === SITE_HOST && isAppOnlyPath(pathname)) return to(APP_HOST);
  if (host === APP_HOST && isSiteOnlyPath(pathname)) return to(SITE_HOST);
  return null;
}

/**
 * Continue to the route. Pages get a fresh nonce and CSP: the request header
 * is how Next.js learns the nonce to put on its scripts. Skipped for API
 * routes (JSON) and the MkDocs proxy, which serves its own HTML and scripts.
 */
function pass(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") || pathname === "/dashboard/docs" || pathname.startsWith("/dashboard/docs/")) return NextResponse.next();
  const nonce = newNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === "development",
    https: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    sentryOrigin: dsnOrigin(process.env.NEXT_PUBLIC_GLITCHTIP_DSN),
  });
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  const redirect = hostRedirect(req);
  if (redirect) return redirect;

  if (HOST_SPLIT_ENABLED && pathname === "/robots.txt" && hostOf(req) === APP_HOST) {
    return new NextResponse("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const redemption = redeemTokenPath(pathname);
  if (redemption) {
    const url = req.nextUrl.clone();
    url.pathname = redemption.redirectTo;
    const res = NextResponse.redirect(url);
    res.cookies.set(ATTEMPT_TOKEN_COOKIE, redemption.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: ATTEMPT_TOKEN_MAX_AGE_SECONDS,
    });
    return res;
  }

  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (!isDashboard && !AUTH_PAGES.has(pathname)) return pass(req);

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const user = token ? await currentSessionUser(token) : null;

  if (isDashboard) {
    if (!user) {
      const login = new URL("/login", req.url);
      login.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    const rule = AREA_MIN_ROLE.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
    if (rule && !roleAtLeast(user.role, rule.minRole)) return NextResponse.redirect(new URL("/dashboard", req.url));
    return pass(req);
  }

  // Auth pages
  return user ? NextResponse.redirect(new URL("/dashboard", req.url)) : pass(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|js)$).*)"],
};

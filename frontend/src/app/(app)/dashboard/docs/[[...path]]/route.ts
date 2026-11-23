import { NextResponse, type NextRequest } from "next/server";
import { canViewDocs } from "@/lib/roles";
import { requireUser } from "@/server/auth/require-user";

/**
 * Internal MkDocs site (docker-compose `docs` service, no public port), shown
 * to ADMIN, SUPER_ADMIN and DEV only.
 *
 * Segments are restricted to plain path characters. The previous version
 * interpolated decoded segments into an injected <base href="…">, so a link
 * like /dashboard/docs/%22%3E%3Cscript%3E… was reflected XSS on the app origin.
 */
const PREFIX = "/dashboard/docs";
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const auth = await requireUser(req);
  if (auth.response) return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(PREFIX)}`, req.url));
  if (!canViewDocs(auth.user.role)) return NextResponse.redirect(new URL("/dashboard", req.url));

  const segments = (await params).path ?? [];
  if (segments.some((s) => !SAFE_SEGMENT.test(s) || s === "." || s === "..")) return new NextResponse("Not found", { status: 404 });

  // MkDocs use_directory_urls: pages are <path>/index.html; anything with a dot is an asset.
  const last = segments.at(-1) ?? "";
  const isPage = segments.length === 0 || !last.includes(".");
  const upstreamPath = segments.length === 0 ? "index.html" : isPage ? `${segments.join("/")}/index.html` : segments.join("/");

  let upstream: Response;
  try {
    upstream = await fetch(`http://docs/${upstreamPath}`, { cache: "no-store" });
  } catch {
    return new NextResponse("Docs are unavailable right now.", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  // Pages link relative to their own directory; without a <base> the visitor's
  // missing trailing slash breaks every CSS/JS/nav link. Segments are already
  // restricted to [A-Za-z0-9._-], so this string is safe to embed.
  if (isPage && contentType.startsWith("text/html")) {
    const base = `${PREFIX}/${segments.map((s) => `${s}/`).join("")}`;
    const html = (await upstream.text()).replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`);
    return new NextResponse(html, { status: 200, headers: { "content-type": contentType } });
  }
  return new NextResponse(upstream.body, { status: 200, headers: { "content-type": contentType } });
}

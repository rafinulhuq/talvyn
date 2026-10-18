import { NextResponse } from "next/server";
import { requireDocsAccess } from "@/lib/docs";

const DOCS_PREFIX = "/dashboard/docs";

// The docs container (docker-compose.prod.yml `docs` service) has no
// public port — this route is the only way to reach it, gated by
// requireDocsAccess() (ADMIN / SUPER_ADMIN / DEV). MkDocs' default
// use_directory_urls output means every page is `<path>/index.html`, with
// CSS/JS/nav links generated relative to that page's own directory.
function resolveUpstreamPath(segments: string[]): { upstreamPath: string; isDirectory: boolean } {
  const joined = segments.join("/");
  if (!joined) return { upstreamPath: "index.html", isDirectory: true };
  const last = segments[segments.length - 1];
  if (last.includes(".")) return { upstreamPath: joined, isDirectory: false };
  return { upstreamPath: `${joined}/index.html`, isDirectory: true };
}

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  await requireDocsAccess();

  const { path } = await params;
  const segments = path ?? [];
  const { upstreamPath, isDirectory } = resolveUpstreamPath(segments);

  const upstreamRes = await fetch(`http://docs/${upstreamPath}`);
  if (!upstreamRes.ok || !upstreamRes.body) {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType = upstreamRes.headers.get("content-type") ?? "application/octet-stream";

  // Directory pages (`<path>/index.html`) use links relative to their own
  // directory, but the browser's address bar for e.g. `/dashboard/docs`
  // (no trailing slash) treats the current directory as `/dashboard`, not
  // `/dashboard/docs` — every relative CSS/JS/nav link then 404s and the
  // page renders as raw unstyled HTML. A <base> tag fixes what "current
  // directory" means for the page regardless of the exact URL shown, so
  // it works whether or not the visitor's link included a trailing slash.
  if (isDirectory && contentType.startsWith("text/html")) {
    const html = await upstreamRes.text();
    const base = `${DOCS_PREFIX}/${segments.join("/")}${segments.length ? "/" : ""}`;
    const withBase = html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`);
    return new NextResponse(withBase, { status: 200, headers: { "content-type": contentType } });
  }

  return new NextResponse(upstreamRes.body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

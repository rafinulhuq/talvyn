import { NextResponse, type NextRequest } from "next/server";
import { isSafeId } from "@/server/auth/require-user";
import { backendBaseUrl } from "@/server/internal-api";
import { errorJson } from "@/server/upstream";

// Public: serves published media (blog covers etc.) by id. No auth, no internal token.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSafeId(id)) return errorJson(404, "CMP_MEDIA_NOT_FOUND", "Media not found.");
  try {
    const upstream = await fetch(`${backendBaseUrl()}/api/v1/cmp/media/${id}/content`, { cache: "no-store" });
    if (!upstream.ok) return errorJson(upstream.status, "CMP_MEDIA_NOT_FOUND", "Media not found.");
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": upstream.headers.get("cache-control") ?? "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new NextResponse(await upstream.arrayBuffer(), { status: 200, headers });
  } catch (err) {
    console.error(`[cms/media/${id}] ${(err as Error).message}`);
    return errorJson(502, "CMP_MEDIA_UNAVAILABLE", "Media is unavailable right now.");
  }
}

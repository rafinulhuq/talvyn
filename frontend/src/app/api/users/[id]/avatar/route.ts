import { NextResponse, type NextRequest } from "next/server";
import { isSafeId, requireUser } from "@/server/auth/require-user";
import { backendBaseUrl, internalHeaders } from "@/server/internal-api";
import { errorJson } from "@/server/upstream";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!isSafeId(id)) return errorJson(404, "AVATAR_NOT_FOUND", "No avatar for this user.");
  try {
    const upstream = await fetch(`${backendBaseUrl()}/api/v1/users/${id}/avatar`, {
      headers: internalHeaders(auth.user.id),
      cache: "no-store",
    });
    if (!upstream.ok) return errorJson(upstream.status, "AVATAR_NOT_FOUND", "No avatar for this user.");
    return new NextResponse(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
        "Cache-Control": upstream.headers.get("cache-control") ?? "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error(`[users/avatar] ${(err as Error).message}`);
    return errorJson(502, "AVATAR_UNAVAILABLE", "Avatar is unavailable right now.");
  }
}

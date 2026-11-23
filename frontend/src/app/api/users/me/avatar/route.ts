import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { backendBaseUrl, internalHeaders } from "@/server/internal-api";
import { forwardUpload } from "@/server/uploads";
import { errorJson } from "@/server/upstream";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const res = await forwardUpload(req, auth.user.id, {
    backendPath: "/api/v1/users/me/avatar",
    maxFileMb: 5, // mirrors backend avatar_service.MAX_AVATAR_BYTES
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    typeError: "Upload a JPEG, PNG or WebP image.",
  });
  return res.ok ? new NextResponse(null, { status: 204 }) : res;
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  try {
    const upstream = await fetch(`${backendBaseUrl()}/api/v1/users/me/avatar`, {
      method: "DELETE",
      headers: internalHeaders(auth.user.id),
    });
    if (!upstream.ok) return errorJson(upstream.status, "AVATAR_DELETE_FAILED", "Couldn't remove the profile picture.");
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(`[users/me/avatar DELETE] ${(err as Error).message}`);
    return errorJson(502, "UPLOAD_BACKEND_UNAVAILABLE", "The service is unavailable. Try again shortly.");
  }
}

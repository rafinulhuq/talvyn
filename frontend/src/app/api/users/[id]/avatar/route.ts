import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
    }

    const { id } = await params;
    const fastapiUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
    const internalToken = process.env.INTERNAL_API_SECRET ?? "";

    const upstream = await fetch(
      `${fastapiUrl}/api/v1/users/${encodeURIComponent(id)}/avatar`,
      {
        headers: {
          "X-Internal-Token": internalToken,
          "X-Actor-Id": session.user.id,
        },
        cache: "no-store",
      }
    );

    if (!upstream.ok) {
      return NextResponse.json(
        { error: { code: "AVATAR_NOT_FOUND", message: "No avatar for this user." } },
        { status: upstream.status }
      );
    }

    const body = await upstream.arrayBuffer();
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "image/webp");
    headers.set("Cache-Control", upstream.headers.get("cache-control") ?? "private, max-age=3600");

    return new NextResponse(body, { status: upstream.status, headers });
  } catch (err) {
    console.error("[api/users/:id/avatar] error:", err);
    return NextResponse.json(
      { error: { code: "AVATAR_UNAVAILABLE", message: "Avatar is unavailable." } },
      { status: 502 }
    );
  }
}

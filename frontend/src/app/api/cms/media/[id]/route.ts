import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fastapiUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
    const upstream = await fetch(
      `${fastapiUrl}/api/v1/cmp/media/${encodeURIComponent(id)}/content`,
      { cache: "no-store" }
    );

    if (!upstream.ok) {
      return NextResponse.json(
        { error: { code: "CMP_MEDIA_NOT_FOUND", message: "Media asset not found." } },
        { status: upstream.status }
      );
    }

    const body = await upstream.arrayBuffer();
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
    headers.set("Cache-Control", upstream.headers.get("cache-control") ?? "public, max-age=3600");
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);

    return new NextResponse(body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error("[api/cmp/media/:id] error:", err);
    return NextResponse.json(
      { error: { code: "CMP_MEDIA_UNAVAILABLE", message: "Media asset is unavailable." } },
      { status: 502 }
    );
  }
}

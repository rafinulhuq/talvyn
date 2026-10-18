import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 }
      );
    }
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Super Admin access required." } },
        { status: 403 }
      );
    }

    const fastapiUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
    const internalToken = process.env.INTERNAL_API_SECRET ?? "";
    if (!fastapiUrl || !internalToken) {
      return NextResponse.json(
        { error: { code: "CMP_PROXY_MISCONFIGURED", message: "CMP media upload is not configured." } },
        { status: 500 }
      );
    }

    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: { code: "FILE_TOO_LARGE", message: "CMP media files must be 8MB or smaller." } },
        { status: 413 }
      );
    }

    const incoming = await req.formData().catch(() => null);
    if (!incoming) {
      return NextResponse.json(
        { error: { code: "INVALID_MULTIPART_FORM", message: "The media upload could not be read." } },
        { status: 400 }
      );
    }

    const file = incoming.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "NO_FILE", message: "No file uploaded." } },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { error: { code: "EMPTY_FILE", message: "The selected file is empty." } },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: { code: "FILE_TOO_LARGE", message: "CMP media files must be 8MB or smaller." } },
        { status: 413 }
      );
    }

    const forward = new FormData();
    forward.append("file", file, file.name);
    const title = incoming.get("title");
    const altText = incoming.get("alt_text");
    if (typeof title === "string") forward.append("title", title);
    if (typeof altText === "string") forward.append("alt_text", altText);

    const upstream = await fetch(`${fastapiUrl}/api/v1/cmp/media`, {
      method: "POST",
      headers: {
        "X-Internal-Token": internalToken,
        "X-Actor-Id": session.user.id,
      },
      body: forward,
    });

    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    console.error("[api/cmp/media] error:", err);
    return NextResponse.json(
      { error: { code: "CMP_BACKEND_UNAVAILABLE", message: "CMP media upload failed." } },
      { status: 502 }
    );
  }
}

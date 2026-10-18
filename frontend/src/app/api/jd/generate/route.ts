import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Dedicated proxy for JD generation — mirrors /api/jd/upload: session-checked,
// forwards the internal token + the uploader id server-side (never exposed to
// the browser). Small JSON brief; a generous cap guards against abuse.
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const fastapiUrl = process.env.FASTAPI_INTERNAL_URL ?? "http://localhost:8000";
    const internalToken = process.env.INTERNAL_API_SECRET ?? "";
    if (!fastapiUrl || !internalToken) {
      return NextResponse.json(
        {
          error: {
            code: "GENERATE_PROXY_MISCONFIGURED",
            message: "JD generation service is not configured correctly.",
          },
        },
        { status: 500 }
      );
    }

    const body = await req.text();
    if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Brief is too large." } },
        { status: 413 }
      );
    }

    const upstreamRes = await fetch(`${fastapiUrl}/api/v1/jd/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": internalToken,
        "X-Uploader-Id": session.user.id,
      },
      body,
    });

    if (!upstreamRes.ok) {
      const errorBody = await upstreamRes.json().catch(() => ({}));
      const error =
        errorBody?.error ?? {
          code: upstreamRes.status >= 500 ? "GENERATE_BACKEND_ERROR" : "GENERATE_REJECTED",
          message:
            typeof errorBody?.detail === "string"
              ? errorBody.detail
              : upstreamRes.status >= 500
                ? "The generation service failed."
                : "The brief was rejected.",
        };
      return NextResponse.json({ error }, { status: upstreamRes.status });
    }

    const responseBody = await upstreamRes.json().catch(() => ({}));
    return NextResponse.json(responseBody, { status: upstreamRes.status });
  } catch (err) {
    console.error("[jd/generate] error:", err);
    return NextResponse.json(
      {
        error: {
          code: "GENERATE_BACKEND_UNAVAILABLE",
          message: "The generation service is temporarily unavailable.",
        },
      },
      { status: 502 }
    );
  }
}
